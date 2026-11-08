function stripJson(text) {
  let trimmed = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

function formatBank(items) {
  const lines = [];
  for (const [kind, label] of [
    ["word", "Words"],
    ["pattern", "Sentence patterns (句型)"],
    ["collocation", "Collocations (常用搭配)"],
  ]) {
    const list = items[kind] || [];
    if (!list.length) continue;
    lines.push(`${label}:`);
    for (const item of list.slice(0, 40)) {
      const extra = [item.note, item.example].filter(Boolean).join(" | ");
      lines.push(`- ${item.term}${extra ? ` (${extra})` : ""}`);
    }
  }
  return lines.join("\n") || "(empty — no stored items yet)";
}

function grammarPrompt(text) {
  return `Correct the English grammar and spelling only. Do not change meaning or style.
Target language: English.
Return JSON only:
{
  "results": [{"text": "corrected sentence", "translation": "Chinese translation", "note": "brief change"}],
  "learnings": {
    "words": [{"term": "", "note": "meaning or usage"}],
    "patterns": [{"term": "句型 template with blanks or structure", "example": ""}],
    "collocations": [{"term": "word pairing", "example": ""}]
  }
}
If nothing useful to learn, use empty arrays.
Include a Chinese translation for every result.
Input: ${JSON.stringify(text)}`;
}

function refinePrompt(text, bank) {
  return `Rewrite the input into natural English. Give 3 distinct options.
Prefer stored words, 句型, and 常用搭配 when they fit. Do not force them.
Target language: English.
Stored bank:
${formatBank(bank)}

Return JSON only:
{
  "results": [{"text": "rewritten sentence", "translation": "Chinese translation", "note": "why this option"}],
  "learnings": {
    "words": [{"term": "useful new word from this rewrite", "note": ""}],
    "patterns": [{"term": "reusable 句型", "example": ""}],
    "collocations": [{"term": "常用搭配", "example": ""}]
  }
}
Include a Chinese translation for every result.
Input: ${JSON.stringify(text)}`;
}

function normalizeLearnings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const pick = (arr, kind) =>
    (Array.isArray(arr) ? arr : [])
      .map((item) => ({
        kind,
        term: String(item.term || item.text || item.phrase || "").trim(),
        note: String(item.note || item.gloss || "").trim(),
        example: String(item.example || "").trim(),
      }))
      .filter((item) => item.term);

  return [
    ...pick(src.words, "word"),
    ...pick(src.patterns, "pattern"),
    ...pick(src.collocations, "collocation"),
  ];
}

function normalizeResults(parsed, fallback) {
  const results = Array.isArray(parsed.results) ? parsed.results : [];
  const cleaned = results
    .map((item) => ({
      text: String(item.text || item.sentence || "").trim(),
      translation: String(item.translation || "").trim(),
      note: String(item.note || "").trim(),
    }))
    .filter((item) => item.text);
  if (!cleaned.length && fallback) cleaned.push({ text: fallback, translation: "", note: "unchanged" });
  return cleaned;
}

async function listModelNames(host) {
  const res = await fetch(`${host}/api/tags`);
  if (!res.ok) throw new Error(`Cannot reach Ollama at ${host}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

async function resolveModel(host, preferred) {
  let names = [];
  try {
    names = await listModelNames(host);
  } catch (err) {
    throw new Error(`Cannot reach Ollama at ${host}. Start it with \`ollama serve\`.`);
  }
  if (!names.length) {
    throw new Error("No Ollama models installed. Try `ollama pull llama3.2`.");
  }
  if (names.includes(preferred)) return preferred;
  const tagged = names.find((name) => name.startsWith(`${preferred}:`));
  if (tagged) return tagged;
  const skip = /image|vision|llava|diffusion|turbo/i;
  const textModel = names.find((name) => !skip.test(name));
  if (textModel) return textModel;
  throw new Error(`No text model installed. Have: ${names.join(", ")}.`);
}

async function refine({ host, model, mode, text, bank }) {
  const base = String(host).replace(/\/$/, "");
  const resolved = await resolveModel(base, model);
  const prompt = mode === "grammar" ? grammarPrompt(text) : refinePrompt(text, bank);
  const url = `${base}/api/chat`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolved,
      stream: false,
      format: "json",
      think: false,
      options: { num_predict: 512, temperature: 0.2 },
      messages: [
        {
          role: "system",
          content: "You are a concise English writing helper. Reply with JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.message?.content || "";
  return finalizeResponse(resolved, content, text);
}

function finalizeResponse(model, content, fallback) {
  const parsed = stripJson(content);
  return {
    model,
    results: normalizeResults(parsed, fallback),
    learnings: normalizeLearnings(parsed.learnings),
  };
}

async function refineStream({ host, model, mode, text, bank, onModel, onToken }) {
  const base = String(host).replace(/\/$/, "");
  const resolved = await resolveModel(base, model);
  if (onModel) onModel(resolved);
  const prompt = mode === "grammar" ? grammarPrompt(text) : refinePrompt(text, bank);
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: resolved,
      stream: true,
      format: "json",
      think: false,
      options: { num_predict: 512, temperature: 0.2 },
      messages: [
        {
          role: "system",
          content: "You are a concise English writing helper. Reply with JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama ${response.status}: ${body.slice(0, 200)}`);
  }
  if (!response.body) throw new Error("Ollama returned an empty response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let finished = false;
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(String(event.error));
    const token = event?.message?.content || "";
    if (token) {
      content += token;
      if (onToken) onToken(token);
    }
    if (event.done) finished = true;
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) consume(line);
  }
  pending += decoder.decode();
  if (pending.trim()) consume(pending);
  return finalizeResponse(resolved, content, text);
}

module.exports = { refine, refineStream, resolveModel, stripJson };
