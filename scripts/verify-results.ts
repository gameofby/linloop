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
ollama.refineStream = async ({ mode, text, onModel, onToken }) => {
  onModel('fixture');
  const result = { text: `${mode} English.`, translation: '中文', note: '' };
  onToken('{"results":[{"text":' + JSON.stringify(result.text));
  await new Promise(resolve => setTimeout(resolve, 150));
  onToken(',"translation":"中文","note":""}]');
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
  await until(() => !win.webContents.isLoading());
  const js = code => win.webContents.executeJavaScript(code);
  const enter = text => js(`input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input'));`);
  assert.equal(await js("input.tagName"), 'TEXTAREA');
  await enter('A short paragraph.\nA second line.');
  await wait(1000);
  assert.equal(Boolean(gates.grammar || gates.refine), false, 'Wait for a 1.5-second pause');
  await until(() => gates.grammar && gates.refine);
  for (const section of ['grammar', 'refine']) {
    assert.equal(await js(`document.querySelector('#${section}-results .translation').textContent`), '中文');
    assert.equal(await js(`getComputedStyle(document.querySelector('#${section}-results .translation')).display !== 'none'`), true);
  }
  for (const theme of ['dark', 'light']) {
    await js(`applyTheme('${theme}')`);
    assert.equal(await js("getComputedStyle(document.querySelector('.copy')).backgroundColor"), 'rgba(0, 0, 0, 0)',
      'Copy must use the same transparent style as the other result controls');
  }
  assert.equal(await js("document.querySelector('#model-note').textContent"), 'via fixture');
  assert.equal(await js("statusEl.classList.contains('hidden')"), true, 'The model must not use a status row');
  assert.equal(await js("getComputedStyle(input).fontFamily === getComputedStyle(document.querySelector('.item .text')).fontFamily"), true,
    'Writing and results must use the same font');
  assert.equal(await js("document.querySelectorAll('.copy').length"), 2, 'Each section needs a concise copy control');
  await js("window.savedCopy = document.querySelector('#grammar-results .copy')");
  gates.grammar();
  await wait(100);
  assert.equal(await js("savedCopy === document.querySelector('#grammar-results .copy')"), true,
    'Streaming updates must preserve the button during a click');
  await js("savedCopy.click()");
  await until(() => clipboard.readText() === 'grammar English.');
  await until(() => js("savedCopy.textContent === 'Copied'"));
  assert.equal(await js("statusEl.classList.contains('hidden')"), true, 'Copy feedback must not add a status row');
  await js("document.querySelector('#refine-results .copy').click()");
  await until(() => clipboard.readText() === 'refine English.');
  gates.refine();
  await wait(100);
  const out = path.join(process.cwd(), 'out');
  fs.mkdirSync(out, { recursive: true });
  app.emit('activate');
  for (const theme of ['dark', 'light', 'auto']) {
    await js(`applyTheme('${theme}'); input.setSelectionRange(0, 0); input.blur()`);
    await wait(100);
    fs.writeFileSync(path.join(out, `results-${theme}.png`), (await win.capturePage()).toPNG());
  }
  assert.equal(await js("document.querySelectorAll('#refine-results .item').length"), 1);
  await js("input.focus(); input.setSelectionRange(input.value.length, input.value.length)");
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await until(() => js("input.value.charCodeAt(input.value.length - 1) === 10"));
  // Refill results after the new line invalidates the old response.
  delete gates.grammar; delete gates.refine;
  await until(() => gates.grammar && gates.refine);
  gates.grammar(); gates.refine();
  await wait(100);
  clipboard.writeText('before shortcut');
  await js("input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', metaKey: true, shiftKey: true, bubbles: true}))");
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
  assert.equal(await js("document.querySelector('#model-note').classList.contains('hidden')"), true);
  gates.grammar(); gates.refine();
  await wait(1100);
  assert.equal(await js("document.querySelectorAll('.item').length"), 0, 'Editing must invalidate old responses immediately');
  delete gates.grammar; delete gates.refine;
  await enter(('A paragraph with enough words to wrap over several lines. ').repeat(160));
  await until(() => gates.grammar && gates.refine);
  assert.equal(await js("input.scrollHeight > input.clientHeight"), true, 'Long drafts must scroll inside the editor');
  await js("document.getElementById('gear').click()");
  await until(() => js("!settingsEl.classList.contains('hidden')"));
  assert.equal(await js("document.querySelector('.shell').clientHeight <= innerHeight"), true, 'The paper must stay inside the window');
  await js("document.querySelector('.shell').scrollTop = 10000");
  assert.equal(await js("document.querySelector('.shell').scrollTop > 0"), true, 'Settings and results must remain reachable by scrolling');
  console.log('PASS: paper editor, paragraph input, pause, matching font, long draft, scrolling,  copy controls, clipboard IPC, stable streaming buttons, one candidate, section failure, Enter, stale requests');
}
let savedClipboard;
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (savedClipboard !== undefined) clipboard.writeText(savedClipboard);
  fs.rmSync(dir, {recursive: true, force: true});
  app.exit(process.exitCode || 0);
});
