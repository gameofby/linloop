const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, globalShortcut, screen } = require("electron");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-settings-"));
app.setPath("userData", dataDir);
require("../src/main/main");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run() {
  await app.whenReady();
  let win;
  for (let attempt = 0; attempt < 100; attempt++) {
    win = BrowserWindow.getAllWindows()[0];
    if (win && !win.webContents.isLoading()) break;
    await wait(50);
  }
  assert.ok(win, "Main window must load");
  const evaluate = (code) => win.webContents.executeJavaScript(code);
  await evaluate("document.getElementById('gear').click()");
  await wait(100);
  await evaluate("document.getElementById('preferences').open = true");
  const recorded = await evaluate(`
    document.getElementById('hotkey').focus();
    document.getElementById('hotkey').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
    }));
    document.getElementById('hotkey').value;
  `);
  assert.equal(recorded, "Control+Shift+K", "Hotkey field must record a key combination");
  await evaluate("document.getElementById('settings-save').click()");
  await wait(100);
  assert.equal(await evaluate("window.linloop.getSettings().then(s => s.hotkey)"), recorded);
  assert.ok(globalShortcut.isRegistered(recorded), "Saved hotkey must be registered");
  assert.ok(!globalShortcut.isRegistered("CommandOrControl+Shift+L"), "Old hotkey must be released");
  const rejected = await evaluate("window.linloop.setSettings({hotkey: 'invalid+shortcut'})");
  assert.equal(rejected.hotkeyOk, false);
  assert.equal(rejected.hotkey, recorded, "Invalid hotkey must not be saved");
  assert.ok(globalShortcut.isRegistered(recorded), "Invalid hotkey must preserve the active shortcut");
  const conflict = "Control+Alt+Shift+J";
  assert.ok(globalShortcut.register(conflict, () => {}));
  const unavailable = await evaluate(`window.linloop.setSettings({hotkey: ${JSON.stringify(conflict)}})`);
  assert.equal(unavailable.hotkeyOk, false);
  assert.equal(unavailable.hotkey, recorded);
  assert.ok(globalShortcut.isRegistered(recorded));
  globalShortcut.unregister(conflict);
  await evaluate(`document.getElementById('gear').click()`);
  await wait(50);
  await evaluate(`document.getElementById('hotkey').value = 'invalid+shortcut';
    document.getElementById('settings-save').click()`);
  await wait(50);
  assert.equal(await evaluate("document.getElementById('settings').classList.contains('hidden')"), false);
  assert.match(await evaluate("document.getElementById('hotkey-hint').textContent"), /invalid or unavailable/);
  await evaluate("document.getElementById('hotkey-reset').click()");
  assert.equal(await evaluate("document.getElementById('hotkey').value"), "CommandOrControl+Shift+L");
  await evaluate(`document.getElementById('hotkey').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))`);
  assert.equal(await evaluate("document.getElementById('hotkey').value"), recorded);
  const unchanged = await evaluate("window.linloop.setSettings({theme: 'light'})");
  assert.ok(unchanged.hotkeyOk);
  assert.ok(globalShortcut.isRegistered(recorded));
  assert.ok((await evaluate("document.getElementById('input').title")).includes("Ctrl+Shift+K"));
  await evaluate("document.getElementById('settings-close').click()");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.writing-area')).cursor"), "grab");
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.bar')).getPropertyValue('-webkit-app-region')"), "drag");
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  win.setPosition(area.x + 30, area.y + 30);
  const before = win.getBounds();
  const originalCursor = screen.getCursorScreenPoint;
  let cursor = { x: before.x + 4, y: before.y + 20 };
  screen.getCursorScreenPoint = () => cursor;
  win.webContents.sendInputEvent({ type: "mouseDown", x: 4, y: 20, button: "left", clickCount: 1 });
  await wait(50);
  assert.equal(await evaluate("document.querySelector('.shell').classList.contains('dragging')"), true);
  cursor = { x: cursor.x + 20, y: cursor.y + 20 };
  win.webContents.sendInputEvent({ type: "mouseMove", x: 24, y: 40 });
  await wait(50);
  assert.equal(win.getBounds().x, before.x + 20);
  assert.equal(win.getBounds().y, before.y + 20);
  win.webContents.sendInputEvent({ type: "mouseUp", x: 24, y: 40, button: "left", clickCount: 1 });
  await wait(50);
  assert.equal(await evaluate("document.querySelector('.shell').classList.contains('dragging')"), false);
  screen.getCursorScreenPoint = originalCursor;
  const store = require("../src/main/store");
  await store.init(dataDir);
  assert.equal(store.getSettings().hotkey, recorded, "Hotkey must survive a database reload");
  console.log("PASS: key recording, registration, invalid-key recovery, theme save, hint, persistence, and window dragging");
}
run().then(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  app.exit(0);
}).catch((error) => {
  console.error(error);
  fs.rmSync(dataDir, { recursive: true, force: true });
  app.exit(1);
});
