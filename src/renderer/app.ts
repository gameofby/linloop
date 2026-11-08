// @ts-nocheck

const input = document.getElementById("input");
const statusEl = document.getElementById("status");
const dictionaryEl = document.getElementById("dictionary");
const assistEl = document.getElementById("assist");
const grammarResultsEl = document.getElementById("grammar-results");
const refineResultsEl = document.getElementById("refine-results");
const settingsEl = document.getElementById("settings");

let grammarResult = null;
let results = [];
let selected = 0;
let timer;
let inflight = 0;
let speaking = null;
let speechRequest = 0;
const speakInput = document.getElementById("speak-input");
const speechAvailable = window.linloop.speechAvailable;
const streaming = { grammar: "", refine: "" };
speakInput.classList.toggle("hidden", !speechAvailable);

function updateSpeechControls() {
  speakInput.disabled = !input.value.trim();
  document.querySelectorAll(".speech").forEach((button) => {
    const key = button.id === "speak-input" ? "input" : button.dataset.key;
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

function resize() {
  const height = document.querySelector(".shell").scrollHeight;
  window.linloop.resize(height);
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replaceAll("\\n", " ").replaceAll('\\"', '"');
  }
}

function streamingResults(raw) {
  const items = [];
  let current = {};
  const pattern = /"(text|translation|note)"\s*:\s*"((?:\\.|[^"\\])*)("?)/g;
  for (const match of raw.split('"learnings"')[0].matchAll(pattern)) {
    const value = decodeJsonString(match[2]).trim();
    if (!value) continue;
    if (match[1] === "text" && current.text) {
      items.push(current);
      current = {};
    }
    current[match[1]] = value;
  }
  if (current.text) items.push(current);
  return items;
}

function resultRows(items, section, selectedIndex = -1) {
  return items.map((item, i) => {
    const key = `${section}-${i}`;
    return `
      <div class="result-row ${i === selectedIndex ? "active" : ""}">
        <button class="item" data-section="${section}" data-i="${i}">
          <div class="text">${escapeHtml(item.text)}</div>
          ${item.translation ? `<div class="translation">${escapeHtml(item.translation)}</div>` : ""}
          ${item.note ? `<div class="note">${escapeHtml(item.note)}</div>` : ""}
        </button>
        ${speechAvailable ? `<button class="speech" data-key="${key}" data-section="${section}" data-i="${i}" title="Pronounce suggestion"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 10H2v4h2.5L9 17V7Z"/><path d="M13 8.5a5 5 0 0 1 0 7M16 5.5a9 9 0 0 1 0 13"/></svg></button>` : ""}
      </div>`;
  }).join("");
}

function renderResultList(container, items, section, selectedIndex = -1, placeholder = "") {
  container.innerHTML = items.length
    ? resultRows(items, section, selectedIndex)
    : `<div class="result-placeholder">${escapeHtml(placeholder)}</div>`;
}

function resetAssist() {
  streaming.grammar = "";
  streaming.refine = "";
  grammarResult = null;
  results = [];
  selected = 0;
  grammarResultsEl.replaceChildren();
  refineResultsEl.replaceChildren();
  assistEl.classList.add("hidden");
}

function showAssist(placeholders = true) {
  assistEl.classList.remove("hidden");
  renderResultList(grammarResultsEl, grammarResult ? [grammarResult] : [], "grammar", -1,
    placeholders ? "Generating…" : "");
  renderResultList(refineResultsEl, results, "refine", selected,
    placeholders ? "Generating…" : "");
  updateSpeechControls();
  resize();
}

function renderStreaming(section, raw) {
  const items = streamingResults(raw);
  if (section === "grammar") grammarResult = items[0] || null;
  if (section === "refine") results = items;
  showAssist(true);
}

function renderResults(placeholders = false) {
  grammarResultsEl.innerHTML = grammarResult
    ? resultRows([grammarResult], "grammar")
    : `<div class="result-placeholder">${placeholders ? "Generating…" : ""}</div>`;
  refineResultsEl.innerHTML = results.length
    ? resultRows(results, "refine", selected)
    : `<div class="result-placeholder">${placeholders ? "Generating…" : ""}</div>`;
  updateSpeechControls();
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
  if (speaking && speaking !== "input") stopSpeaking();
  const id = ++inflight;
  renderDictionary(null);
  resetAssist();
  setStatus("Generating…");
  const models = new Set();
  try {
    const data = await window.linloop.refineStream({ text }, (event) => {
      if (id !== inflight) return;
      if (event?.type === "model") {
        showAssist(true);
        models.add(event.model);
        setStatus(`via ${[...models].join(", ")}`);
      } else if (event?.type === "delta") {
        const section = event.section === "grammar" ? "grammar" : "refine";
        streaming[section] += String(event.content || "");
        renderStreaming(section, streaming[section]);
      }
    });
    if (id !== inflight) return;
    if (data.dictionary) {
      resetAssist();
      renderDictionary(data.dictionary);
      setStatus("");
      return;
    }
    grammarResult = data.grammar || null;
    results = data.refine || [];
    selected = 0;
    showAssist(false);
    setStatus(data.models?.length ? `via ${data.models.join(", ")}` : "");
  } catch (err) {
    if (id !== inflight) return;
    resetAssist();
    setStatus(err.message || String(err));
    resize();
  }
}

async function choose(section, index) {
  const item = section === "grammar" ? grammarResult : results[index];
  if (!item) return;
  if (section === "refine") selected = index;
  renderResults();
  await window.linloop.copyText(item.text);
  setStatus("Copied. Paste anywhere.");
  resize();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runRefine, 900);
}

input.addEventListener("input", () => {
  if (speaking) stopSpeaking();
  updateSpeechControls();
  renderDictionary(null);
  resetAssist();
  if (input.value.trim().length > 2) schedule();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    window.linloop.hide();
  } else if (event.key === "Enter" && event.metaKey) {
    event.preventDefault();
    runRefine();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (results.length) choose("refine", selected);
    else if (grammarResult) choose("grammar", 0);
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

function handleResultClick(event) {
  const speechButton = event.target.closest(".speech");
  if (speechButton) {
    const section = speechButton.dataset.section;
    const index = Number(speechButton.dataset.i);
    const item = section === "grammar" ? grammarResult : results[index];
    if (item) pronounce(speechButton.dataset.key, item.text);
    return;
  }
  const button = event.target.closest(".item");
  if (button) choose(button.dataset.section, Number(button.dataset.i));
}

grammarResultsEl.addEventListener("click", handleResultClick);
refineResultsEl.addEventListener("click", handleResultClick);

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
