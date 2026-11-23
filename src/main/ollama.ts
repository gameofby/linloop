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

// Keep complete result text when generation stops in a translation or note.
function completedResults(content) {
  const raw = String(content).replace(/<think>[\s\S]*?<\/think>/gi, "");
  const match = /"results"\s*:\s*\[/.exec(raw);
  if (!match) return [];
  let depth = 0, start = -1, quoted = false, escaped = false;
  const results = [];
  for (let i = match.index + match[0].length; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "}" || char === "]") {
      if (depth === 0) break;
      if (--depth === 0) {
        try { results.push(JSON.parse(raw.slice(start, i + 1))); } catch { break; }
      }
    }
  }
  if (depth > 0 && start !== -1) {
    const item = { text: "" };
    const fields = /"(text|translation|note)"\s*:\s*("(?:\\.|[^"\\])*")/g;
    for (const field of raw.slice(start).matchAll(fields)) {
      try { item[field[1]] = JSON.parse(field[2]); } catch { /* Ignore unfinished fields. */ }
    }
    if (item.text) results.push(item);
  }
  return results;
}

const responseFormat = {
  type: "object",
  properties: {
    results: {
      type: "array", minItems: 1, maxItems: 1,
      items: {
        type: "object",
        properties: { text: { type: "string" }, translation: { type: "string" }, note: { type: "string" } },
        required: ["text"], additionalProperties: false,
      },
    },
  },
  required: ["results"], additionalProperties: false,
};

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

function languageName(language) {
  return language === "fr" ? "French" : "English";
}

function grammarPrompt(text, language) {
  const task = language === "fr"
    ? "Corrige seulement la grammaire et l’orthographe. Garde le sens. Le résultat doit être une phrase française."
    : "Correct grammar and spelling only. Keep the original meaning. The result must be English.";
  return `Correct the ${languageName(language)} grammar and spelling only.
Target language: ${languageName(language)}.
${task}
Return JSON only: {"results":[{"text":"the corrected text"}]}.
Return exactly one result. Do not explain or translate. Do not include learning lists.
Input: ${JSON.stringify(text)}`;
}

function refinePrompt(text, bank, language) {
  const task = language === "fr"
    ? "Réécris la phrase en français naturel. Garde le sens. Le résultat doit être une phrase française."
    : "Rewrite the input into natural English. Keep the original meaning.";
  const context = language === "fr" ? "" : `Stored bank (use only if it fits):\n${formatBank(bank)}`;
  return `Rewrite the input into natural ${languageName(language)}. Give exactly one best option.
Target language: ${languageName(language)}.
${task}
${context}
Return JSON only: {"results":[{"text":"the rewritten text"}]}.
Return exactly one result. Do not explain or translate. Do not include learning lists.
Input: ${JSON.stringify(text)}`;
}

function normalizeLearnings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const pick = (arr, kind) =>
    (Array.isArray(arr) ? arr : [])
      .filter((item) => item && typeof item === "object")
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

function normalizeResults(parsed) {
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const cleaned = results
    .filter((item) => item && typeof item.text === "string")
    .map((item) => ({
      text: String(item.text || item.sentence || "").trim(),
      translation: String(item.translation || "").trim(),
      note: String(item.note || "").trim(),
    }))
    .filter((item) => item.text);
  return cleaned.slice(0, 1);
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
    throw new Error("Local AI is not ready. Open Settings and select Install and download.");
  }
  if (names.includes(preferred)) return preferred;
  const tagged = names.find((name) => name === `${preferred}:latest`);
  if (tagged) return tagged;
  throw new Error("The selected model is not installed. Open Settings and select Install and download.");
}

async function chatRequest({ host, model, provider, messages, stream, format, maxTokens = 1024 }) {
  const mlx = provider === "mlx";
  return fetch(`${host}${mlx ? "/v1/chat/completions" : "/api/chat"}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mlx
      ? { model, messages, stream, max_tokens: maxTokens, temperature: 0.2 }
      : { model, messages, stream, format, think: false, options: { num_predict: maxTokens, temperature: 0.2 } }),
  });
}

async function refine({ host, model, mode, text, bank, language = "en", provider = "ollama", displayModel }) {
  const base = String(host).replace(/\/$/, "");
  const resolved = provider === "mlx" ? model : await resolveModel(base, model);
  const prompt = mode === "grammar" ? grammarPrompt(text, language) : refinePrompt(text, bank, language);
  const response = await chatRequest({ host: base, model: resolved, provider, stream: false, format: responseFormat,
    messages: [
      { role: "system", content: `You are a concise ${languageName(language)} writing helper. Reply with JSON only.` },
      { role: "user", content: prompt },
    ],
  });
  if (!response.ok) throw new Error(`Local AI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const content = provider === "mlx" ? data?.choices?.[0]?.message?.content : data?.message?.content;
  return finalizeResponse(displayModel || resolved, content || "", base, language, provider, resolved);
}

async function finalizeResponse(model, content, host, language, provider = "ollama", requestModel = model) {
  let parsed;
  try { parsed = stripJson(content); }
  catch { parsed = { results: completedResults(content) }; }
  const results = normalizeResults(parsed);
  if (!results.length) throw new Error("Could not finish the result. Try again.");
  return {
    model,
    results: await Promise.all(results.map(async (item) => {
      if (item.translation && /[\u3400-\u9fff]/.test(item.translation)) return item;
      try {
        const response = await chatRequest({ host, model: requestModel, provider, stream: false,
          format: { type: "object", properties: { translation: { type: "string" } }, required: ["translation"], additionalProperties: false },
          messages: [{ role: "user", content: `请将下面的${language === "fr" ? "法语" : "英语"}翻译成简体中文。不要解释，不要重复原文。${provider === "mlx" ? "只输出中文译文。" : '仅返回 JSON，包含 translation 字段，字段内容为中文译文。'}\n原文：${JSON.stringify(item.text)}` }],
        });
        if (!response.ok) throw new Error("Translation request failed");
        const data = await response.json();
        const raw = provider === "mlx" ? data?.choices?.[0]?.message?.content : data?.message?.content;
        let translated;
        try { translated = stripJson(raw); }
        catch (error) {
          if (provider !== "mlx" || typeof raw !== "string" || /[{}]/.test(raw)) throw error;
          translated = { translation: raw.trim() };
        }
        if (typeof translated.translation !== "string" || !/[\u3400-\u9fff]/.test(translated.translation)) {
          throw new Error("Translation is empty");
        }
        return { ...item, translation: translated.translation.trim() };
      } catch {
        return { ...item, translation: "", translationError: "Translation unavailable. Try again." };
      }
    })),
    learnings: normalizeLearnings(parsed.learnings),
  };
}

async function refineStream({ host, model, mode, text, bank, language = "en", provider = "ollama", displayModel, onModel, onToken }) {
  const base = String(host).replace(/\/$/, "");
  const resolved = provider === "mlx" ? model : await resolveModel(base, model);
  if (onModel) onModel(displayModel || resolved);
  const prompt = mode === "grammar" ? grammarPrompt(text, language) : refinePrompt(text, bank, language);
  const response = await chatRequest({ host: base, model: resolved, provider, stream: true, format: responseFormat,
    messages: [
      { role: "system", content: `You are a concise ${languageName(language)} writing helper. Reply with JSON only.` },
      { role: "user", content: prompt },
    ],
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local AI ${response.status}: ${body.slice(0, 200)}`);
  }
  if (!response.body) throw new Error("Local AI returned an empty response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let finished = false;
  const consume = (line) => {
    let payload = line.trim();
    if (!payload || payload.startsWith(":")) return;
    if (provider === "mlx") {
      if (!payload.startsWith("data:")) return;
      payload = payload.slice(5).trim();
      if (payload === "[DONE]") { finished = true; return; }
    }
    const event = JSON.parse(payload);
    if (event.error) throw new Error(String(event.error.message || event.error));
    const token = provider === "mlx" ? event.choices?.[0]?.delta?.content || "" : event?.message?.content || "";
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
  return finalizeResponse(displayModel || resolved, content, base, language, provider, resolved);
}

module.exports = { refine, refineStream, resolveModel, stripJson };
