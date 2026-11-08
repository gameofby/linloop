const { execFile } = require("node:child_process");
const path = require("node:path");

const MAX_QUERY_LENGTH = 200;
const WORD_RE = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;
const COLLOCATION_RE = /^[A-Za-z]+(?:[ -][A-Za-z]+){1,5}$/;

function nativeHelperPath(moduleDir = __dirname) {
  const bundled = path.join(moduleDir, "../../native/linloop-dictionary");
  return bundled.includes(`${path.sep}app.asar${path.sep}`)
    ? bundled.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    : bundled;
}

function decodeHtml(value) {
  const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === "#") {
      const radix = entity[1].toLowerCase() === "x" ? 16 : 10;
      const code = Number.parseInt(entity.slice(radix === 16 ? 2 : 1), radix);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return entities[entity.toLowerCase()] || whole;
  });
}

function cleanText(value) {
  return decodeHtml(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([;,.;:!?，。；：！？])/g, "$1")
    .trim();
}

function elements(xml, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openRe = new RegExp(`<([a-z][\\w:-]*)[^>]*class="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`, "gi");
  const result = [];
  for (const match of xml.matchAll(openRe)) {
    const start = match.index;
    const tag = match[1];
    const depthRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    depthRe.lastIndex = start;
    let depth = 0;
    let end = -1;
    for (let token = depthRe.exec(xml); token; token = depthRe.exec(xml)) {
      if (token[0][1] === "/") depth--;
      else depth++;
      if (depth === 0) {
        end = depthRe.lastIndex;
        break;
      }
    }
    if (end > 0) {
      const html = xml.slice(start, end);
      const inner = html.replace(openRe, "").replace(new RegExp(`</${tag}>$`, "i"), "");
      result.push({ html, inner, text: cleanText(inner), start, end });
    }
  }
  return result;
}

function first(xml, className) {
  return elements(xml, className)[0];
}

function normalizePhrase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function exactSection(xml, query) {
  const want = normalizePhrase(query);
  const phrasalVerb = elements(xml, "pvsec")
    .find((section) => normalizePhrase(first(section.html, "pv")?.text) === want);
  if (phrasalVerb) return phrasalVerb.html;
  return elements(xml, "subEntry")
    .find((section) => normalizePhrase(first(section.html, "l")?.text) === want)?.html || "";
}

function sentenceExamples(xml) {
  return elements(xml, "ex").map((item) => item.text).filter(Boolean).slice(0, 3);
}

function uniqueText(items) {
  return items
    .map((item) => typeof item === "string" ? item : item.text)
    .filter((text, index, all) => text && all.indexOf(text) === index);
}

function isInside(item, ranges) {
  return ranges.some((range) => item.start >= range.start && item.end <= range.end);
}

function translationDefinitions(xml, limit = 6) {
  const excluded = elements(xml, "exg");
  const allSenses = elements(xml, "semb").filter((sense) => !isInside(sense, excluded));
  const senses = allSenses.filter((sense) =>
    !allSenses.some((parent) => parent !== sense && sense.start >= parent.start && sense.end <= parent.end));
  const definitions = [];
  for (const sense of senses) {
    const groups = elements(sense.html, "trg")
      .filter((group) => !isInside(group, elements(sense.html, "exg")));
    const parts = [];
    for (const group of groups) {
      const translations = elements(group.html, "trans")
        .filter((item) => !/\bty_pinyin\b/.test(item.html.match(/^<[^>]+>/)?.[0] || ""));
      const values = uniqueText(translations);
      if (!values.length) continue;
      const label = first(group.html, "ind")?.text || "";
      parts.push([label, values.join(" / ")].filter(Boolean).join(" "));
    }
    const definition = parts.filter(Boolean).join("；");
    if (definition && !definitions.includes(definition)) definitions.push(definition);
    if (definitions.length === limit) break;
  }
  if (definitions.length) return definitions;

  const allGroups = elements(xml, "trg").filter((group) => !isInside(group, excluded));
  const groups = allGroups.filter((group) =>
    !allGroups.some((parent) => parent !== group && group.start >= parent.start && group.end <= parent.end));
  for (const group of groups) {
    const values = uniqueText(elements(group.html, "trans")
      .filter((item) => !/\bty_pinyin\b/.test(item.html.match(/^<[^>]+>/)?.[0] || ""))
      .filter((item) => !isInside(item, elements(group.html, "exg"))));
    const label = first(group.html, "ind")?.text || "";
    const definition = [label, values.join(" / ")].filter(Boolean).join(" ");
    if (definition && !definitions.includes(definition)) definitions.push(definition);
    if (definitions.length === limit) break;
  }
  return definitions;
}

function englishDefinitions(xml, limit = 6) {
  return uniqueText(elements(xml, "df")).slice(0, limit);
}

function definitionsFor(xml, limit = 6) {
  return translationDefinitions(xml, limit).length
    ? translationDefinitions(xml, limit)
    : englishDefinitions(xml, limit);
}

function queryKind(query) {
  if (WORD_RE.test(query)) return "word";
  if (COLLOCATION_RE.test(query)) return "collocation";
  return "sentence";
}

async function runHelper(executable, text) {
  return new Promise((resolve, reject) => {
    execFile(executable, [text], { timeout: 8000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error && !stdout) return reject(new Error("macOS Dictionary lookup failed."));
      try {
        resolve(JSON.parse(String(stdout || "{}")));
      } catch {
        reject(new Error("macOS Dictionary returned invalid data."));
      }
    });
  });
}

async function lookup(text, executable = nativeHelperPath()) {
  const query = String(text || "").trim().replace(/\s+/g, " ");
  if (!query) throw new Error("Type a word or phrase first.");
  if (query.length > MAX_QUERY_LENGTH) throw new Error("Dictionary lookup supports up to 200 characters.");
  const result: any = await runHelper(executable, query);
  if (result.notFound) return null;
  if (!result.xml) throw new Error(result.error || "macOS Dictionary returned an empty entry.");

  const xml = String(result.xml);
  const recordTitle = cleanText(xml.match(/<d:entry[^>]*d:title="([^"]+)"/i)?.[1] || query);
  const kind = queryKind(query);
  const section = kind === "collocation" ? exactSection(xml, query) : "";
  if (kind === "collocation" && !section && normalizePhrase(recordTitle) !== normalizePhrase(query)) return null;
  const title = kind === "collocation" ? query : recordTitle;
  const headword = kind === "collocation" ? title : first(xml, "hw")?.text || title;
  const phoneticItems = section ? elements(section, "ph") : [];
  const phonetic = uniqueText(phoneticItems.length ? phoneticItems : elements(xml, "ph")).slice(0, 2).join("  ");
  const body = section || xml;
  const definitions = definitionsFor(body);
  if (!definitions.length) return null;
  return {
    kind,
    query,
    title,
    headword,
    phonetic,
    definitions,
    compact: definitions.join("；"),
    phraseText: section ? cleanText(section) : "",
    examples: sentenceExamples(body),
    source: result.source || "macOS Dictionary",
  };
}

function isLookupInput(text, mode = "grammar") {
  const value = String(text || "").trim();
  if (mode === "grammar" && WORD_RE.test(value)) return true;
  return WORD_RE.test(value) || COLLOCATION_RE.test(value);
}

module.exports = { lookup, isLookupInput, cleanText, MAX_QUERY_LENGTH, nativeHelperPath };
