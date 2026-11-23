// @ts-nocheck

const input = document.getElementById("input");
const inputPreview = document.getElementById("input-preview");
const renderMarkdown = window.renderMarkdown;
document.querySelectorAll("[data-markdown]").forEach((element) => {
  element.innerHTML = renderMarkdown(element.dataset.markdown);
});

function showInputPreview(preview = document.activeElement !== input) {
  preview = preview && Boolean(input.value.trim());
  inputPreview.innerHTML = renderMarkdown(input.value);
  inputPreview.classList.toggle("hidden", !preview);
  input.classList.toggle("previewing", preview);
}
input.addEventListener("blur", () => { showInputPreview(true); resize(); });
input.addEventListener("focus", () => { showInputPreview(false); resize(); });
function editInput() {
  showInputPreview(false);
  input.focus();
  resize();
}
inputPreview.addEventListener("click", editInput);
inputPreview.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    editInput();
  }
});
const statusEl = document.getElementById("status");
const modelNoteEl = document.getElementById("model-note");
const dictionaryEl = document.getElementById("dictionary");
const assistEl = document.getElementById("assist");
const grammarResultsEl = document.getElementById("grammar-results");
const refineResultsEl = document.getElementById("refine-results");
const settingsEl = document.getElementById("settings");

let grammarResult = null;
let dictionaryEntry = null;
let results = [];
let selected = 0;
let timer;
let composing = false;
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
    const icon = button.querySelector(".speech-icon") || button;
    icon.innerHTML = active
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 10H2v4h2.5L9 17V7Z"/><path d="M13 8.5a5 5 0 0 1 0 7M16 5.5a9 9 0 0 1 0 13"/></svg>`;
    button.setAttribute("aria-label", active ? "Stop pronunciation" :
      key === "input" ? "Pronounce input" : key === "dictionary" ? "Pronounce dictionary word" :
        `Pronounce suggestion ${Number(button.dataset.i) + 1}`);
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

function setModelNote(models) {
  const text = [...new Set(models)].filter(Boolean).join(", ");
  modelNoteEl.textContent = text ? `via ${text}` : "";
  modelNoteEl.title = modelNoteEl.textContent;
  modelNoteEl.classList.toggle("hidden", !text);
}

function resize() {
  input.style.height = "auto";
  input.style.height = `${Math.min(300, Math.max(112, input.scrollHeight))}px`;
  const height = document.querySelector(".shell").scrollHeight + 2;
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
    if (match[1] === "text") current.complete = match[3] === '"';
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
          <div class="text markdown">${renderMarkdown(item.text)}</div>
          <div class="translation markdown">${renderMarkdown(item.translation || item.translationError || "Translating…")}</div>
          ${item.note ? `<div class="note markdown">${renderMarkdown(item.note)}</div>` : ""}
        </button>
        <button class="copy" data-section="${section}" data-i="${i}" title="Copy result" aria-label="Copy ${section === "grammar" ? "grammar correction" : "refine result"}" ${item.complete === false ? "disabled" : ""}>Copy</button>
        ${speechAvailable ? `<button class="speech" data-key="${key}" data-section="${section}" data-i="${i}" title="Pronounce suggestion"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 10H2v4h2.5L9 17V7Z"/><path d="M13 8.5a5 5 0 0 1 0 7M16 5.5a9 9 0 0 1 0 13"/></svg></button>` : ""}
      </div>`;
  }).join("");
}

function renderResultList(container, items, section, selectedIndex = -1, placeholder = "") {
  if (!items.length) {
    container.innerHTML = `<div class="result-placeholder">${escapeHtml(placeholder)}</div>`;
    return;
  }
  // Keep buttons mounted so token updates cannot interrupt a pointer click.
  if (container.querySelectorAll(".result-row").length !== items.length) {
    container.innerHTML = resultRows(items, section, selectedIndex);
  }
  items.forEach((item, i) => {
    const row = container.children[i];
    row.classList.toggle("active", i === selectedIndex);
    row.querySelector(".item").disabled = item.complete === false;
    row.querySelector(".copy").disabled = item.complete === false;
    for (const field of ["text", "translation", "note"]) {
      let element = row.querySelector(`.${field}`);
      if (!element) {
        element = document.createElement("div");
        element.className = `${field} markdown`;
        row.querySelector(".item").append(element);
      }
      const value = field === "translation"
        ? item.translation || item.translationError || "Translating…" : item[field];
      element.innerHTML = renderMarkdown(value);
      element.hidden = !value;
    }
  });
}

function resetAssist() {
  setModelNote([]);
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
  const items = streamingResults(raw).slice(0, 1);
  if (section === "grammar") grammarResult = items[0] || null;
  if (section === "refine") results = items;
  showAssist(true);
}

function renderResults(placeholders = false) {
  showAssist(placeholders);
}

function renderDictionary(entry) {
  dictionaryEntry = entry;
  if (!entry) {
    dictionaryEl.classList.add("hidden");
    dictionaryEl.replaceChildren();
    return;
  }
  dictionaryEl.innerHTML = `
    <div class="dictionary-head">
      ${speechAvailable ? `<button class="speech dictionary-pronounce" data-key="dictionary" title="Pronounce dictionary word">` : "<div>"}
        <span><span class="dictionary-word">${escapeHtml(entry.title)}</span>
        ${entry.phonetic ? `<span class="dictionary-phonetic">${escapeHtml(entry.phonetic)}</span>` : ""}</span>
        ${speechAvailable ? '<span class="speech-icon" aria-hidden="true"></span></button>' : "</div>"}
      <span class="dictionary-source">${escapeHtml(entry.source)}</span>
    </div>
    ${entry.definitions?.length
      ? `<ol class="dictionary-definitions">${entry.definitions.map((definition) =>
          `<li class="markdown">${renderMarkdown(definition)}</li>`).join("")}</ol>`
      : `<div class="dictionary-body markdown">${renderMarkdown(entry.compact || "")}</div>`}
  `;
  dictionaryEl.classList.remove("hidden");
  updateSpeechControls();
  resize();
}

dictionaryEl.addEventListener("click", (event) => {
  if (event.target.closest(".dictionary-pronounce") && dictionaryEntry) {
    pronounce("dictionary", dictionaryEntry.title);
  }
});

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
        models.add(event.model);
        setModelNote(models);
        setStatus("");
        showAssist(true);
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
      resize();
      return;
    }
    grammarResult = data.grammar || null;
    results = (data.refine || []).slice(0, 1);
    setModelNote(data.models || models);
    selected = 0;
    showAssist(false);
    setStatus(data.errors?.length ? data.errors.join(" ") : "");
    resize();
  } catch (err) {
    if (id !== inflight) return;
    resetAssist();
    setStatus(err.message || String(err));
    resize();
  }
}

async function choose(section, index) {
  const item = section === "grammar" ? grammarResult : results[index];
  if (!item || item.complete === false) return;
  if (section === "refine") selected = index;
  renderResults();
  const button = document.querySelector(`#${section}-results .copy[data-i="${index}"]`);
  try {
    await window.linloop.copyText(item.text);
    if (button) {
      button.textContent = "Copied";
      button.setAttribute("aria-label", "Copied result");
      clearTimeout(button.copyTimer);
      button.copyTimer = setTimeout(() => {
        button.textContent = "Copy";
        button.setAttribute("aria-label", `Copy ${section === "grammar" ? "grammar correction" : "refine result"}`);
      }, 1500);
    }
  } catch {
    setStatus("Could not copy. Try again.");
  }
  resize();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(runRefine, 500);
}

input.addEventListener("input", () => {
  ++inflight;
  clearTimeout(timer);
  setStatus("");
  if (speaking) stopSpeaking();
  updateSpeechControls();
  renderDictionary(null);
  resetAssist();
  showInputPreview();
  resize();
  if (!composing && input.value.trim()) schedule();
});

input.addEventListener("compositionstart", () => {
  composing = true;
  ++inflight;
  clearTimeout(timer);
});
input.addEventListener("compositionend", () => {
  composing = false;
  if (input.value.trim()) schedule();
});

input.addEventListener("keydown", (event) => {
  if (event.isComposing || composing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    window.linloop.hide();
  } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
    event.preventDefault();
    runRefine();
  } else if (event.key === "Enter" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (results.length) choose("refine", selected);
    else if (grammarResult) choose("grammar", 0);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.defaultPrevented) {
    event.preventDefault();
    window.linloop.hide();
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
  const button = event.target.closest(".item, .copy");
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

const hotkeyInput = document.getElementById("hotkey");
const hotkeyHint = document.getElementById("hotkey-hint");
const defaultHotkey = "CommandOrControl+Shift+L";
let savedHotkey = defaultHotkey;

function hotkeyLabel(value) {
  const mac = navigator.platform.includes("Mac");
  return value.replaceAll("CommandOrControl", mac ? "Cmd" : "Ctrl")
    .replaceAll("Control", "Ctrl").replaceAll("Command", "Cmd");
}

function updateHotkeyHint(value) {
  savedHotkey = value;
  input.title = `Open Linloop: ${hotkeyLabel(value)}`;
}

hotkeyInput.addEventListener("focus", () => {
  showFieldStatus(hotkeyHint, "Press a shortcut. Escape cancels.");
});
hotkeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    hotkeyInput.value = savedHotkey;
    hotkeyInput.blur();
    showFieldStatus(hotkeyHint, "");
    return;
  }
  if (event.isComposing || event.repeat ||
      ["Control", "Meta", "Alt", "Shift"].includes(event.key)) return;
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3)
    : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5)
    : ({ " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" }[event.key]
      || event.key);
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/i.test(key) ||
      !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) {
    showFieldStatus(hotkeyHint, "Use a modifier key with a letter or navigation key.");
    return;
  }
  hotkeyInput.value = [event.metaKey && "Command", event.ctrlKey && "Control",
    event.altKey && "Alt", event.shiftKey && "Shift", key].filter(Boolean).join("+");
  showFieldStatus(hotkeyHint, `${hotkeyLabel(hotkeyInput.value)} selected.`);
});
document.getElementById("hotkey-reset").addEventListener("click", () => {
  hotkeyInput.value = defaultHotkey;
  showFieldStatus(hotkeyHint, "Default shortcut selected.");
});

const shell = document.querySelector(".shell");
let dragPointer = null;
shell.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest("input, textarea, button, label, .editor-content, .settings, .status, .list, .dictionary")) return;
  event.preventDefault();
  shell.setPointerCapture(event.pointerId);
  dragPointer = event.pointerId;
  shell.classList.add("dragging");
  window.linloop.dragWindow("start");
});
shell.addEventListener("pointermove", (event) => {
  if (event.pointerId === dragPointer) window.linloop.dragWindow("move");
});
function endWindowDrag() {
  if (dragPointer === null) return;
  const pointer = dragPointer;
  dragPointer = null;
  shell.classList.remove("dragging");
  if (shell.hasPointerCapture(pointer)) shell.releasePointerCapture(pointer);
  window.linloop.dragWindow("end");
}
shell.addEventListener("pointerup", endWindowDrag);
shell.addEventListener("pointercancel", endWindowDrag);
shell.addEventListener("lostpointercapture", endWindowDrag);
window.addEventListener("blur", endWindowDrag);

function showFieldStatus(element, message) {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}
function closeSettings() {
  settingsEl.classList.add("hidden");
  shell.classList.remove("settings-open");
  resize();
}
document.getElementById("gear").addEventListener("click", async () => {
  const settings = await window.linloop.getSettings();
  hotkeyInput.value = settings.hotkey;
  updateHotkeyHint(settings.hotkey);
  showFieldStatus(hotkeyHint, "");
  document.getElementById("dictionary-first").checked = settings.dictionaryFirst !== false;
  applyTheme(settings.theme);
  settingsEl.classList.remove("hidden");
  shell.classList.add("settings-open");
  settingsEl.querySelectorAll("details").forEach(details => { details.open = false; });
  showFieldStatus(modelStatus, "");
  showFieldStatus(downloadStatus, "");
  resize();
  await refreshAIStatus();
});
document.getElementById("settings-close").addEventListener("click", closeSettings);
settingsEl.querySelectorAll("details").forEach(details => details.addEventListener("toggle", resize));

document.getElementById("settings-save").addEventListener("click", async () => {
  const button = document.getElementById("settings-save");
  button.disabled = true;
  try {
    const next = await window.linloop.setSettings({
      hotkey: hotkeyInput.value,
      dictionaryFirst: document.getElementById("dictionary-first").checked,
      theme: document.querySelector(".theme.on")?.dataset.theme || "auto",
    });
    if (!next.hotkeyOk) {
      document.getElementById("preferences").open = true;
      showFieldStatus(hotkeyHint, next.error);
      return;
    }
    applyTheme(next.theme);
    updateHotkeyHint(next.hotkey);
    closeSettings();
  } catch (error) { showFieldStatus(modelStatus, error.message || "Could not save settings."); }
  finally { button.disabled = false; resize(); }
});

document.getElementById("theme-modes").addEventListener("click", async event => {
  const button = event.target.closest(".theme");
  if (!button) return;
  applyTheme(button.dataset.theme);
  await window.linloop.setSettings({ theme: button.dataset.theme });
});

const aiStatusEl = document.getElementById("ai-status");
const aiInitialize = document.getElementById("ai-initialize");
const modelInput = document.getElementById("model");
const modelStatus = document.getElementById("model-status");
const downloadInput = document.getElementById("model-download");
const downloadButton = document.getElementById("ai-download");
const downloadStatus = document.getElementById("model-download-status");
let aiWorking = false;
let aiStatusRequest = 0;
let selectedModel = "";

function setAIWorking(working) {
  aiWorking = working;
  if (!working) return;
  aiInitialize.disabled = true;
  modelInput.disabled = true;
  downloadInput.disabled = true;
  downloadButton.disabled = true;
}

async function refreshAIStatus() {
  const id = ++aiStatusRequest;
  try {
    const settings = await window.linloop.getSettings();
    const state = await window.linloop.aiStatus(settings.model);
    if (id !== aiStatusRequest) return;
    selectedModel = settings.model;
    modelInput.replaceChildren();
    for (const name of state.models) {
      const option = document.createElement("option");
      option.value = name; option.textContent = name;
      modelInput.append(option);
    }
    const selected = [...modelInput.options].find(option => option.value === settings.model || option.value === `${settings.model}:latest`);
    if (selected) modelInput.value = selected.value;
    else {
      const option = document.createElement("option");
      option.value = ""; option.textContent = "No model selected"; option.disabled = true; option.selected = true;
      modelInput.prepend(option);
    }
    aiStatusEl.textContent = state.message;
    aiInitialize.classList.toggle("hidden", state.installed && state.defaultReady);
    aiInitialize.textContent = state.installed ? "Get default model" : "Set up";
    modelInput.disabled = aiWorking || !state.models.length;
    downloadInput.disabled = aiWorking || !state.installed;
    downloadButton.disabled = aiWorking || !state.installed;
    aiInitialize.disabled = aiWorking || state.busy;
  } catch (error) {
    aiStatusEl.textContent = error.message;
    aiInitialize.classList.remove("hidden");
    modelInput.disabled = true;
  }
  resize();
}
function useChangedModel() {
  ++inflight;
  clearTimeout(timer);
  resetAssist();
  if (input.value.trim()) schedule();
}
modelInput.addEventListener("change", async () => {
  const choice = modelInput.value;
  setAIWorking(true);
  try {
    const settings = await window.linloop.setSettings({ model: choice });
    selectedModel = settings.model;
    showFieldStatus(modelStatus, "");
    useChangedModel();
  } catch (error) {
    modelInput.value = selectedModel;
    showFieldStatus(modelStatus, error.message);
  } finally { setAIWorking(false); await refreshAIStatus(); }
  resize();
});
window.linloop.onAIProgress(progress => {
  if (progress.action === "initialize") aiStatusEl.textContent = progress.message;
  else showFieldStatus(downloadStatus, progress.message);
  resize();
});
aiInitialize.addEventListener("click", async () => {
  if (aiWorking) return;
  setAIWorking(true);
  let failure = "";
  try { await window.linloop.initializeAI(); }
  catch (error) { failure = error.message; }
  finally {
    setAIWorking(false);
    await refreshAIStatus();
    if (failure) aiStatusEl.textContent = failure;
  }
});
downloadButton.addEventListener("click", async () => {
  if (aiWorking || !downloadInput.value.trim()) return;
  setAIWorking(true);
  try {
    await window.linloop.downloadModel(downloadInput.value.trim());
    showFieldStatus(downloadStatus, "Downloaded. Select it in Model to use it.");
    await refreshAIStatus();
  } catch (error) { showFieldStatus(downloadStatus, error.message); }
  finally { setAIWorking(false); await refreshAIStatus(); resize(); }
});
window.linloop.getSettings().then(settings => {
  applyTheme(settings.theme);
  updateHotkeyHint(settings.hotkey);
});

window.linloop.onFocusInput(editInput);

updateSpeechControls();
resize();
input.focus();
