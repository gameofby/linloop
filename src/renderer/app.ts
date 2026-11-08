// @ts-nocheck

const input = document.getElementById("input");
const statusEl = document.getElementById("status");
const streamEl = document.getElementById("stream");
const streamBody = document.getElementById("stream-body");
const resultsEl = document.getElementById("results");
const dictionaryEl = document.getElementById("dictionary");
const learnEl = document.getElementById("learn");
const learnList = document.getElementById("learn-list");
const settingsEl = document.getElementById("settings");
const modeButtons = [...document.querySelectorAll(".mode")];

let mode = "grammar";
let results = [];
let selected = 0;
let pending = [];
let timer;
let inflight = 0;
let speaking = null;
let speechRequest = 0;
const speakInput = document.getElementById("speak-input");
const speechAvailable = window.linloop.speechAvailable;
speakInput.classList.toggle("hidden", !speechAvailable);

function updateSpeechControls() {
  speakInput.disabled = !input.value.trim();
  document.querySelectorAll(".speech").forEach((button) => {
    const key = button.id === "speak-input" ? "input" : `result-${button.dataset.i}`;
    const active = speaking === key;
    button.classList.toggle("playing", active);
    button.innerHTML = active
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 10H2v4h2.5L9 17V7Z"/><path d="M13 8.5a5 5 0 0 1 0 7M16 5.5a9 9 0 0 1 0 13"/></svg>`;
    button.setAttribute("aria-label", active ? "Stop pronunciation" :
      key === "input" ? "Pronounce input" : `Pronounce suggestion ${Number(button.dataset.i) + 1}`);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function stopSpeaking() {
  ++speechRequest;
  speaking = null;
  updateSpeechControls();
  await window.linloop.stopSpeaking();
}

async function pronounce(key, text) {
  if (speaking === key) return stopSpeaking();
  const id = ++speechRequest;
  speaking = key;
  updateSpeechControls();
  try {
    await window.linloop.speak(text);
  } catch (err) {
    if (id === speechRequest) {
      setStatus(err.message || String(err));
      resize();
    }
  } finally {
    if (id === speechRequest) {
      speaking = null;
      updateSpeechControls();
    }
  }
}

speakInput.addEventListener("click", () => pronounce("input", input.value));

function setStatus(text) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("hidden", !text);
}

function kindLabel(kind) {
  if (kind === "pattern") return "句型";
  if (kind === "collocation") return "搭配";
  return "word";
}

function resize() {
  const height = document.querySelector(".shell").scrollHeight;
  window.linloop.resize(height);
}

function resetStream() {
  streamBody.replaceChildren();
  streamEl.classList.add("hidden");
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replaceAll("\\n", " ").replaceAll('\\"', '"');
  }
}

function renderStream(raw) {
  const fields = [];
  const pattern = /"(text|translation|note)"\s*:\s*"((?:\\.|[^"\\])*)("?)/g;
  for (const match of raw.matchAll(pattern)) {
    const value = decodeJsonString(match[2]).trim();
    if (value && !fields.some((field) => field.value === value)) {
      fields.push({ label: match[1], value });
    }
  }
  streamBody.innerHTML = fields.slice(0, 12)
    .map((field) => `<div class="stream-line"><span class="stream-label">${escapeHtml(field.label)}</span>${escapeHtml(field.value)}</div>`)
    .join("");
  streamEl.classList.remove("hidden");
  resize();
}

function renderResults() {
  resultsEl.innerHTML = results
    .map(
      (item, i) => `
      <div class="result-row ${i === selected ? "active" : ""}">
      <button class="item" data-i="${i}">
        <div class="text">${escapeHtml(item.text)}</div>
        ${item.translation ? `<div class="translation">${escapeHtml(item.translation)}</div>` : ""}
        ${item.note ? `<div class="note">${escapeHtml(item.note)}</div>` : ""}
      </button>
      ${speechAvailable ? `<button class="speech" data-i="${i}" title="Pronounce suggestion"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 10H2v4h2.5L9 17V7Z"/><path d="M13 8.5a5 5 0 0 1 0 7M16 5.5a9 9 0 0 1 0 13"/></svg></button>` : ""}
      </div>`
    )
    .join("");
  updateSpeechControls();
  resize();
}

function renderLearnings(items) {
  pending = items;
  learnList.innerHTML = items
    .map(
      (item, i) => `
      <label class="choice">
        <input type="checkbox" data-i="${i}" checked />
        <span><span class="kind">${kindLabel(item.kind)}</span> ${escapeHtml(item.term)}
        <small>${escapeHtml([item.note, item.example].filter(Boolean).join(" · "))}</small></span>
      </label>`
    )
    .join("");
  learnEl.classList.toggle("hidden", !items.length);
  resize();
}

function renderDictionary(entry) {
  if (!entry) {
    dictionaryEl.classList.add("hidden");
    dictionaryEl.replaceChildren();
    return;
  }
  dictionaryEl.innerHTML = `
    <div class="dictionary-head">
      <div><span class="dictionary-word">${escapeHtml(entry.title)}</span>
      ${entry.phonetic ? `<span class="dictionary-phonetic">${escapeHtml(entry.phonetic)}</span>` : ""}</div>
      <span class="dictionary-source">${escapeHtml(entry.source)}</span>
    </div>
    ${entry.definitions?.length
      ? `<ol class="dictionary-definitions">${entry.definitions.map((definition) =>
          `<li>${escapeHtml(definition)}</li>`).join("")}</ol>`
      : `<div class="dictionary-body">${escapeHtml(entry.compact || "")}</div>`}
  `;
  dictionaryEl.classList.remove("hidden");
  updateSpeechControls();
  resize();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function runRefine() {
  clearTimeout(timer);
  const text = input.value.trim();
  if (!text) return;
  if (speaking?.startsWith("result-")) stopSpeaking();
  const id = ++inflight;
  renderDictionary(null);
  resetStream();
  setStatus("Refining…");
  try {
    let streamed = "";
    const data = await window.linloop.refineStream({ text, mode }, (event) => {
      if (id !== inflight) return;
      if (event?.type === "model") {
        setStatus(`via ${event.model}`);
      } else if (event?.type === "delta") {
        streamed += String(event.content || "");
        renderStream(streamed);
      }
    });
    if (id !== inflight) return;
    resetStream();
    if (speaking?.startsWith("result-")) stopSpeaking();
    renderDictionary(data.dictionary);
    results = data.results || [];
    selected = 0;
    setStatus(results.length ? (data.model ? `via ${data.model}` : "") : "No suggestions.");
    renderResults();
    renderLearnings(data.learnings || []);
  } catch (err) {
    if (id !== inflight) return;
    resetStream();
    if (speaking?.startsWith("result-")) stopSpeaking();
    results = [];
    renderResults();
    renderLearnings([]);
    setStatus(err.message || String(err));
    resize();
  }
}

async function choose(index) {
  const item = results[index];
  if (!item) return;
  selected = index;
  renderResults();
  await window.linloop.copyText(item.text);
  setStatus("Copied. Paste anywhere.");
  resize();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runRefine, 900);
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    modeButtons.forEach((b) => b.classList.toggle("on", b === btn));
    if (input.value.trim()) runRefine();
  });
});

input.addEventListener("input", () => {
  if (speaking) stopSpeaking();
  updateSpeechControls();
  renderDictionary(null);
  resetStream();
  results = [];
  renderResults();
  renderLearnings([]);
  if (input.value.trim().length > 2) schedule();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    window.linloop.hide();
  } else if (event.key === "Enter" && (event.metaKey || results.length === 0)) {
    event.preventDefault();
    runRefine();
  } else if (event.key === "Enter") {
    event.preventDefault();
    choose(selected);
  } else if (event.key === "ArrowDown" && results.length) {
    event.preventDefault();
    selected = (selected + 1) % results.length;
    renderResults();
  } else if (event.key === "ArrowUp" && results.length) {
    event.preventDefault();
    selected = (selected - 1 + results.length) % results.length;
    renderResults();
  }
});

resultsEl.addEventListener("click", (event) => {
  const speechButton = event.target.closest(".speech");
  if (speechButton) {
    const index = Number(speechButton.dataset.i);
    pronounce(`result-${index}`, results[index].text);
    return;
  }
  const btn = event.target.closest(".item");
  if (btn) choose(Number(btn.dataset.i));
});

document.getElementById("learn-skip").addEventListener("click", () => {
  renderLearnings([]);
});

document.getElementById("learn-save").addEventListener("click", async () => {
  const picked = [...learnList.querySelectorAll("input:checked")].map((el) => pending[Number(el.dataset.i)]);
  const saved = await window.linloop.saveItems(picked);
  setStatus(saved.length ? `Saved ${saved.length} item(s).` : "Nothing selected.");
  renderLearnings([]);
});

function applyTheme(theme) {
  const next = ["auto", "dark", "light"].includes(theme) ? theme : "auto";
  document.documentElement.dataset.theme = next;
  document.querySelectorAll(".theme").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.theme === next);
  });
}

document.getElementById("gear").addEventListener("click", async () => {
  const settings = await window.linloop.getSettings();
  document.getElementById("hotkey").value = settings.hotkey;
  document.getElementById("host").value = settings.ollamaHost;
  document.getElementById("model").value = settings.ollamaModel;
  document.getElementById("dictionary-first").checked = settings.dictionaryFirst !== false;
  applyTheme(settings.theme);
  settingsEl.classList.toggle("hidden");
  resize();
});

document.getElementById("settings-close").addEventListener("click", () => {
  settingsEl.classList.add("hidden");
  resize();
});

document.getElementById("settings-save").addEventListener("click", async () => {
  const theme = document.querySelector(".theme.on")?.dataset.theme || "auto";
  const next = await window.linloop.setSettings({
    hotkey: document.getElementById("hotkey").value.trim(),
    ollamaHost: document.getElementById("host").value.trim(),
    ollamaModel: document.getElementById("model").value.trim(),
    dictionaryFirst: document.getElementById("dictionary-first").checked,
    theme,
  });
  applyTheme(next.theme);
  settingsEl.classList.add("hidden");
  setStatus(next.hotkeyOk ? "Settings saved." : "Saved, but hotkey failed to bind.");
  resize();
});

document.getElementById("theme-modes").addEventListener("click", async (event) => {
  const btn = event.target.closest(".theme");
  if (!btn) return;
  applyTheme(btn.dataset.theme);
  await window.linloop.setSettings({ theme: btn.dataset.theme });
});

window.linloop.getSettings().then((settings) => applyTheme(settings.theme));

window.linloop.onFocusInput(() => {
  input.focus();
  input.select();
});

resize();
input.focus();
