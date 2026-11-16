const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, clipboard } = require('electron');
const ollama = require('../src/main/ollama');
const store = require('../src/main/store');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linloop-results-'));
app.setPath('userData', dir);
const gates: Record<string, () => void> = {};
ollama.refineStream = async ({ mode, text, onToken }) => {
  const result = { text: `${mode} English.`, translation: '中文', note: '' };
  onToken(JSON.stringify({ results: [result] }).slice(0, -1));
  await new Promise<void>(resolve => { gates[mode] = () => {
    onToken(',"learnings":{"words":[]}}');
    resolve();
  }; });
  if (text === 'failure case' && mode === 'refine') throw new Error('Could not finish the result. Try again.');
  return { model: 'fixture', results: [result, { text: 'Extra candidate.' }], learnings: [] };
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let n = 0; n < 200; n++) { if (await check()) return; await wait(25); }
  throw new Error('Timed out waiting for results');
}
async function run() {
  await app.whenReady();
  savedClipboard = clipboard.readText();
  await store.init();
  store.setSettings({ dictionaryFirst: false });
  require('../src/main/main');
  await until(() => BrowserWindow.getAllWindows().length);
  const win = BrowserWindow.getAllWindows()[0];
  win.removeAllListeners('blur');
  await until(() => !win.webContents.isLoading());
  const js = code => win.webContents.executeJavaScript(code);
  const enter = text => js(`input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input'));`);
  await enter('first sentence');
  await until(() => gates.grammar && gates.refine);
  assert.equal(await js("document.querySelectorAll('.copy').length"), 2, 'Each section needs a concise copy control');
  await js("window.savedCopy = document.querySelector('#grammar-results .copy')");
  gates.grammar();
  await wait(100);
  assert.equal(await js("savedCopy === document.querySelector('#grammar-results .copy')"), true,
    'Streaming updates must preserve the button during a click');
  await js("savedCopy.click()");
  await until(() => clipboard.readText() === 'grammar English.');
  await js("document.querySelector('#refine-results .copy').click()");
  await until(() => clipboard.readText() === 'refine English.');
  gates.refine();
  await wait(100);
  assert.equal(await js("document.querySelectorAll('#refine-results .item').length"), 1);
  await js("input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))");
  await until(() => clipboard.readText() === 'refine English.');
  delete gates.grammar; delete gates.refine;
  await enter('failure case');
  await until(() => gates.grammar && gates.refine);
  gates.grammar(); gates.refine();
  await until(() => js("statusEl.textContent.includes('Refine')"));
  assert.equal(await js("document.querySelector('#grammar-results .text').textContent"), 'grammar English.',
    'A failed Refine section must preserve successful grammar');
  assert.equal(await js("document.querySelector('#refine-results .copy') === null"), true,
    'A failed section must not leave an unverified result to copy');
  delete gates.grammar; delete gates.refine;
  await enter('old sentence');
  await until(() => gates.grammar && gates.refine);
  await enter('x');
  gates.grammar(); gates.refine();
  await wait(1100);
  assert.equal(await js("document.querySelectorAll('.item').length"), 0, 'Editing must invalidate old responses immediately');
  console.log('PASS: copy controls, clipboard IPC, stable streaming buttons, one candidate, section failure, Enter, stale requests');
}
let savedClipboard;
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (savedClipboard !== undefined) clipboard.writeText(savedClipboard);
  fs.rmSync(dir, {recursive: true, force: true});
  app.exit(process.exitCode || 0);
});
