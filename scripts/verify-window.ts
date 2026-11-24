const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, globalShortcut } = require("electron");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-window-"));
app.setPath("userData", dir);
let openWindow;
const register = globalShortcut.register.bind(globalShortcut);
globalShortcut.register = (key, callback) => {
  openWindow = callback;
  return register(key, callback);
};
const hotkey = "Control+Alt+Shift+F12";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await wait(50);
  }
  throw new Error(message);
}
async function run() {
  await app.whenReady();
  const store = require("../src/main/store");
  await store.init();
  store.setSettings({ hotkey });
  require("../src/main/main");
  await until(() => openWindow && BrowserWindow.getAllWindows().length, "Window must load");
  assert.ok(globalShortcut.isRegistered(hotkey), "The test shortcut must be registered");
  let win = BrowserWindow.getAllWindows()[0];
  await until(() => !win.webContents.isLoading(), "Renderer must load");
  await until(() => win.isVisible() && win.isFocused(), "Launch must open and focus the paper");
  const inputFocused = () => win.webContents.executeJavaScript("document.hasFocus() && document.activeElement.id === 'input' && getComputedStyle(document.getElementById('input')).display !== 'none'");
  await until(inputFocused, "Launch must show the native input caret");
  const out = path.join(process.cwd(), "out"); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "caret-on-open.png"), (await win.capturePage()).toPNG());
  win.hide();
  win.webContents.reload();
  openWindow();
  await until(() => !win.webContents.isLoading(), "Reload must finish before input focus");
  await until(inputFocused, "Opening during renderer load must restore the input caret");
  openWindow();
  await until(() => win.isFocused(), "Shortcut must focus the window");
  const other = new BrowserWindow({ width: 800, height: 600, fullscreenable: true });
  await other.loadURL("data:text/html,<title>Focus test</title>Other window");
  other.show();
  other.focus();
  await until(() => !win.isFocused(), "The other window must take focus");
  assert.ok(win.isVisible(), "Clicking another window must keep Linloop visible");
  if (process.platform === "darwin") {
    await until(() => other.isFocused(), "The other window must be focused before full screen");
    await wait(500);
    other.setFullScreen(true);
    await until(() => other.isFullScreen(), "The other window must enter full screen");
    await wait(1000);
    assert.ok(win.isVisible(), "A full-screen window must not hide Linloop");
    assert.ok(win.isVisibleOnAllWorkspaces(), "Linloop must remain available across Spaces");
    other.setFullScreen(false);
    await until(() => !other.isFullScreen(), "The other window must leave full screen");
    await wait(1000);
    assert.ok(app.dock.isVisible(), "The Dock icon must provide native Quit access");
  }
  other.destroy();
  openWindow();
  openWindow();
  assert.ok(win.isVisible(), "Repeated shortcut use must not hide the window");
  await until(() => win.isFocused(), "Shortcut must restore focus");
  await win.webContents.executeJavaScript("document.getElementById('input').focus()");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(() => !win.isVisible(), "Escape must hide the window");
  app.emit("activate");
  await until(inputFocused, "Dock activation must restore the input caret");
  assert.ok(win.isVisible(), "Dock activation must reopen the hidden window");
  await win.webContents.executeJavaScript("document.getElementById('gear').focus()");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(() => !win.isVisible(), "Escape must also work outside the input field");
  openWindow();
  win.close();
  app.emit("activate");
  win = BrowserWindow.getAllWindows()[0];
  assert.ok(win && win.isVisible(), "Dock activation must recreate a closed window");
  app.once("will-quit", () => {
    assert.equal(globalShortcut.isRegistered(hotkey), false);
    console.log("PASS: launch caret, focus during page load, Dock input focus, focus loss, full screen, shortcut, Escape, Dock activation, native close, and Quit cleanup");
  });
  app.quit();
}
run().catch(error => { console.error(error); app.exit(1); });
app.on("quit", () => fs.rmSync(dir, { recursive: true, force: true }));
