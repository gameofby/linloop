const fs = require("fs");
const path = require("path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  screen,
} = require("electron");
const store = require("../src/main/store");
const ollama = require("../src/main/ollama");

let win;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 720,
    height: 420,
    x: Math.round((width - 720) / 2),
    y: Math.round(height * 0.18),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../src/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  return win.loadFile(path.join(__dirname, "../src/renderer/index.html"));
}

ipcMain.handle("get-settings", () => store.getSettings());
ipcMain.handle("set-settings", (_e, partial) => {
  const settings = store.setSettings(partial || {});
  return { ...settings, hotkeyOk: true };
});
ipcMain.handle("list-items", () => store.listItems());
ipcMain.handle("save-items", (_e, items) => store.saveItems(items || []));
ipcMain.handle("refine", async (_e, payload) => {
  const settings = store.getSettings();
  return ollama.refine({
    host: settings.ollamaHost,
    model: settings.ollamaModel,
    mode: payload?.mode === "grammar" ? "grammar" : "refine",
    text: String(payload?.text || "").trim(),
    bank: store.itemsByKind(),
  });
});
ipcMain.handle("refine-stream", async (_e, payload) => {
  const settings = store.getSettings();
  const common = {
    host: settings.ollamaHost,
    model: settings.ollamaModel,
    text: String(payload?.text || "").trim(),
    bank: store.itemsByKind(),
  };
  const [grammar, refine] = await Promise.all([
    ollama.refineStream({ ...common, mode: "grammar" }),
    ollama.refineStream({ ...common, mode: "refine" }),
  ]);
  return {
    grammar: grammar.results[0] || null,
    refine: refine.results,
    learnings: [...grammar.learnings, ...refine.learnings],
    models: [grammar.model, refine.model],
  };
});
ipcMain.handle("copy-text", (_e, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});
ipcMain.on("hide", () => {});
ipcMain.on("resize", () => {});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await wait(200);
  }
  throw new Error("timed out waiting for UI");
}

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, "../out");
  fs.mkdirSync(outDir, { recursive: true });
  await store.init();
  store.saveItems([{ kind: "collocation", term: "make a decision", example: "I need to make a decision." }]);
  const settings = store.getSettings();
  const hotkeyOk = globalShortcut.register(settings.hotkey, () => {});
  await createWindow();
  await wait(200);

  await win.webContents.executeJavaScript(`
    document.getElementById('input').value = 'She go to school yesterday';
    document.getElementById('input').dispatchEvent(new Event('input'));
  `);

  await waitFor(async () => {
    const complete = await win.webContents.executeJavaScript(
      "document.querySelectorAll('#grammar-results .item').length > 0 && " +
      "document.querySelectorAll('#refine-results .item').length > 0"
    );
    return complete;
  });

  await win.webContents.executeJavaScript(`
    document.querySelector('.item').click();
  `);
  const copied = clipboard.readText();

  const learnCount = await win.webContents.executeJavaScript(
    "document.querySelectorAll('#learn-list input').length"
  );
  if (learnCount) {
    await win.webContents.executeJavaScript(`document.getElementById('learn-save').click()`);
  }

  await wait(300);
  const png = await win.capturePage();
  const shot = path.join(outDir, "overlay.png");
  fs.writeFileSync(shot, png.toPNG());

  const saved = store.listItems();
  const report = {
    hotkey: settings.hotkey,
    hotkeyOk,
    copied,
    learnCount,
    saved: saved.length,
    shot,
  };
  fs.writeFileSync(path.join(outDir, "verify-electron.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!hotkeyOk) throw new Error("hotkey did not bind");
  if (!copied || copied === "She go to school yesterday") throw new Error("copy-on-select failed");
  app.quit();
});
