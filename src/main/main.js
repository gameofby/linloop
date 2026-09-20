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
    hasShadow: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.on("blur", () => {
    if (win && !win.webContents.isDevToolsOpened()) win.hide();
  });
}

function showWindow() {
  if (!win) return;
  win.show();
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
  createWindow();
  const settings = store.getSettings();
  const ok = bindHotkey(settings.hotkey);
  if (!ok) console.warn("hotkey failed:", settings.hotkey);
  if (process.env.LINLOOP_SHOW === "1") showWindow();
});

app.on("activate", () => showWindow());
app.on("will-quit", () => globalShortcut.unregisterAll());
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

ipcMain.handle("save-items", (_e, items) => store.saveItems(items || []));

ipcMain.handle("refine", async (_e, payload) => {
  const settings = store.getSettings();
  const text = String(payload?.text || "").trim();
  if (!text) throw new Error("Type a sentence first.");
  return ollama.refine({
    host: settings.ollamaHost,
    model: settings.ollamaModel,
    mode: payload?.mode === "grammar" ? "grammar" : "refine",
    text,
    bank: store.itemsByKind(),
  });
});

ipcMain.handle("copy-text", (_e, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});

ipcMain.on("hide", () => win && win.hide());
ipcMain.on("resize", (_e, height) => setWindowHeight(height));
