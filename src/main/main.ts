const path = require("path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
} = require("electron");
const store = require("./store");
const ollama = require("./ollama");
const speech = require("./speech");
const dictionary = require("./dictionary");

let win;
let registeredHotkey = "";

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 720,
    height: 108,
    x: Math.round((width - 720) / 2),
    y: Math.round(height * 0.18),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
  }
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.on("hide", () => speech.stop());
  win.on("closed", () => { speech.stop(); win = undefined; });
  win.on("blur", () => {
    if (win && !win.webContents.isDevToolsOpened()) win.hide();
  });
}

function showWindow() {
  if (!win) return;
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    win.showInactive();
    win.moveTop();
  } else {
    win.show();
  }
  win.focus();
  win.webContents.send("focus-input");
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else showWindow();
}

function bindHotkey(hotkey) {
  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  const ok = globalShortcut.register(hotkey, toggleWindow);
  registeredHotkey = ok ? hotkey : "";
  return ok;
}

function setWindowHeight(height) {
  if (!win) return;
  const next = Math.max(92, Math.min(640, Math.round(height)));
  const [x, y] = win.getPosition();
  win.setBounds({ x, y, width: 720, height: next });
}

app.whenReady().then(async () => {
  await store.init();
  if (process.platform === "darwin") app.dock.hide();
  createWindow();
  const settings = store.getSettings();
  const ok = bindHotkey(settings.hotkey);
  if (!ok) console.warn("hotkey failed:", settings.hotkey);
  if (process.env.LINLOOP_SHOW === "1") showWindow();
});

app.on("activate", () => showWindow());
app.on("will-quit", () => {
  speech.stop();
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-settings", () => store.getSettings());

ipcMain.handle("set-settings", (_e, partial) => {
  const settings = store.setSettings(partial || {});
  const ok = bindHotkey(settings.hotkey);
  return { ...settings, hotkeyOk: ok };
});

ipcMain.handle("list-items", () => store.listItems());

ipcMain.handle("speak", (_e, text) => speech.speak(text));
ipcMain.handle("dictionary", (_e, text) => dictionary.lookup(text));
ipcMain.handle("stop-speaking", () => speech.stop());

ipcMain.handle("save-items", (_e, items) => store.saveItems(items || []));

ipcMain.handle("refine", async (_e, payload) => {
  const settings = store.getSettings();
  const text = String(payload?.text || "").trim();
  if (!text) throw new Error("Type a sentence first.");
  if (settings.dictionaryFirst !== false) {
    try {
      const entry = await dictionary.lookup(text);
      if (entry && (dictionary.isLookupInput(text, payload?.mode) || entry.kind !== "sentence")) {
        return { dictionary: entry, results: [], learnings: [] };
      }
    } catch (error) {
      console.warn("macOS Dictionary lookup failed; using Ollama:", error);
    }
  }
  return ollama.refine({
    host: settings.ollamaHost,
    model: settings.ollamaModel,
    mode: payload?.mode === "grammar" ? "grammar" : "refine",
    text,
    bank: store.itemsByKind(),
  });
});

ipcMain.handle("refine-stream", async (event, payload) => {
  const settings = store.getSettings();
  const text = String(payload?.text || "").trim();
  const requestId = String(payload?.requestId || "");
  if (!text) throw new Error("Type a sentence first.");
  if (settings.dictionaryFirst !== false) {
    try {
      const entry = await dictionary.lookup(text);
      if (entry && (dictionary.isLookupInput(text, payload?.mode) || entry.kind !== "sentence")) {
        return { dictionary: entry, results: [], learnings: [] };
      }
    } catch (error) {
      console.warn("macOS Dictionary lookup failed; using Ollama:", error);
    }
  }
  const send = (message) => {
    if (requestId && !event.sender.isDestroyed()) {
      event.sender.send("refine-stream", { requestId, event: message });
    }
  };
  const bank = store.itemsByKind();
  const request = (mode, section) => ollama.refineStream({
    host: settings.ollamaHost,
    model: settings.ollamaModel,
    mode,
    text,
    bank,
    onModel: (model) => send({ type: "model", section, model }),
    onToken: (content) => send({ type: "delta", section, content }),
  });
  const [grammar, refine] = await Promise.all([
    request("grammar", "grammar"),
    request("refine", "refine"),
  ]);
  const learnings = [...grammar.learnings, ...refine.learnings]
    .filter((item, index, all) =>
      all.findIndex((other) => other.kind === item.kind && other.term === item.term) === index);
  return {
    grammar: grammar.results[0] || null,
    refine: refine.results,
    learnings,
    models: [...new Set([grammar.model, refine.model])],
  };
});

ipcMain.handle("copy-text", (_e, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});

ipcMain.on("hide", () => win && win.hide());
ipcMain.on("resize", (_e, height) => setWindowHeight(height));
