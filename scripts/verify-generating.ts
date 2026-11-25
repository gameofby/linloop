const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linloop-generating-'));
app.setPath('userData', dir);
// Hold runtime startup so no model event can hide the initial status.
require('../src/main/local-ai').connection = () => new Promise(() => {});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await wait(25); }
  throw new Error('Timed out waiting for initial generating status');
}
async function run() {
  await app.whenReady();
  const store = require('../src/main/store');
  await store.init(); store.setSettings({ dictionaryFirst: false });
  require('../src/main/main');
  await until(() => BrowserWindow.getAllWindows().length);
  const win = BrowserWindow.getAllWindows()[0];
  await until(() => !win.webContents.isLoading());
  const js = code => win.webContents.executeJavaScript(code);
  await js("input.value = 'A short sentence.'; input.dispatchEvent(new Event('input'))");
  await until(() => js("statusEl.textContent === 'Generating…' && !statusEl.classList.contains('hidden')"));
  await wait(150);
  const bounds = await js(`(() => {
    const shell = document.querySelector('.shell');
    return { statusBottom: statusEl.getBoundingClientRect().bottom,
      visibleBottom: Math.min(innerHeight, shell.getBoundingClientRect().bottom),
      scrollHeight: shell.scrollHeight, clientHeight: shell.clientHeight };
  })()`);
  console.log(JSON.stringify(bounds));
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync('out/generating.png', (await win.capturePage()).toPNG());
  assert.ok(bounds.statusBottom <= bounds.visibleBottom - 1, 'The complete initial status must fit inside the window');
  assert.ok(bounds.scrollHeight <= bounds.clientHeight, 'A short draft must not require scrolling to see Generating');
  console.log('PASS: initial Generating status is fully visible before the first model event');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
