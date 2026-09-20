const input = document.getElementById("input");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
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
  const height = document.querySelector(".shell").scrollHeight + 16;
  window.linloop.resize(height);
}

function renderResults() {
  resultsEl.innerHTML = results
    .map(
      (item, i) => `
      <button class="item ${i === selected ? "active" : ""}" data-i="${i}">
        <div class="text">${escapeHtml(item.text)}</div>
        ${item.note ? `<div class="note">${escapeHtml(item.note)}</div>` : ""}
      </button>`
    )
    .join("");
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function runRefine() {
  const text = input.value.trim();
  if (!text) return;
  const id = ++inflight;
  setStatus("Refining…");
  try {
    const data = await window.linloop.refine({ text, mode });
    if (id !== inflight) return;
    results = data.results || [];
    selected = 0;
    setStatus(results.length ? (data.model ? `via ${data.model}` : "") : "No suggestions.");
    renderResults();
    renderLearnings(data.learnings || []);
  } catch (err) {
    if (id !== inflight) return;
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
