const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, clipboard } = require('electron');
const ollama = require('../src/main/ollama');
require("../src/main/local-ai").connection = async () => ({ provider: "ollama", host: "http://fixture", model: "fixture" });
const store = require('../src/main/store');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linloop-results-'));
app.setPath('userData', dir);
const gates: Record<string, () => void> = {};
let firstRequestAt = 0;
ollama.refineStream = async ({ mode, text, onModel, onToken }) => {
  if (!firstRequestAt) firstRequestAt = Date.now();
  onModel('fixture');
  const result = text.startsWith('# Draft')
    ? { text: `**${mode}** English.`, translation: '*中文*', note: '`note`' }
    : { text: text === "replacement sentence" ? `${mode} replacement.` : `${mode} English.`, translation: '中文', note: '' };
  onToken('{"results":[{"text":' + JSON.stringify(result.text));
  await new Promise(resolve => setTimeout(resolve, 150));
  onToken(',"translation":' + JSON.stringify(result.translation) + ',"note":' + JSON.stringify(result.note) + '}]');
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
  const enter = text => js(`editInput(); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input'));`);
  assert.equal(await js("input.tagName"), 'TEXTAREA');
  assert.equal(await js("input.hasAttribute('placeholder')"), false);
  assert.equal(await js("document.querySelector('#writing-hint, #language') === null"), true);
  const typedAt = Date.now();
  await enter('A short paragraph.\nA second line.');
  await wait(250);
  assert.equal(Boolean(gates.grammar || gates.refine), false, 'Wait for a 0.5-second pause');
  await until(() => gates.grammar && gates.refine);
  assert.ok(firstRequestAt - typedAt >= 450 && firstRequestAt - typedAt < 1200,
    `The 0.5-second trigger started after ${firstRequestAt - typedAt} ms`);
  for (const section of ['grammar', 'refine']) {
    assert.equal(await js(`document.querySelector('#${section}-results .translation').textContent.trim()`), '中文');
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
  await js("editInput(); input.setSelectionRange(input.value.length, input.value.length)");
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
  assert.equal(await js("document.querySelector('#grammar-results .text').textContent.trim()"), 'grammar English.',
    'A failed Refine section must preserve successful grammar');
  assert.equal(await js("document.querySelector('#refine-results .copy') === null"), true,
    'A failed section must not leave an unverified result to copy');
  delete gates.grammar; delete gates.refine;
  await enter('old sentence');
  await until(() => gates.grammar && gates.refine);
  await enter('');
  assert.equal(await js("document.querySelector('#model-note').classList.contains('hidden')"), true);
  gates.grammar(); gates.refine();
  await wait(1100);
  assert.equal(await js("document.querySelectorAll('.item').length"), 0, 'Editing must invalidate old responses immediately');
  delete gates.grammar; delete gates.refine;
  await enter('old request awaiting response');
  await until(() => gates.grammar && gates.refine);
  const oldGrammar = gates.grammar, oldRefine = gates.refine;
  delete gates.grammar; delete gates.refine;
  await enter('replacement sentence');
  assert.equal(await js("document.querySelectorAll('.result-row').length"), 0);
  await until(() => gates.grammar && gates.refine);
  oldGrammar(); oldRefine();
  await wait(100);
  assert.equal(await js("[...document.querySelectorAll('.text')].every(el => el.textContent.includes('replacement'))"), true,
    'Late responses must not overwrite a newer request');
  gates.grammar(); gates.refine();
  await wait(100);
  assert.equal(await js("document.querySelectorAll('.result-row').length"), 2, 'Only the latest grammar and refine outputs remain');
  delete gates.grammar; delete gates.refine;
  await enter('# Draft\n\nA **simple** paragraph.\n\n- First\n- Second\n\n<script>window.injected = true</script>');
  await until(() => gates.grammar && gates.refine);
  gates.grammar(); gates.refine();
  await until(() => js("Boolean(document.querySelector('#grammar-results .text strong'))"));
  // This desktop session does not dispatch native focus events to test windows.
  await js("input.blur(); input.dispatchEvent(new FocusEvent('blur'))");
  assert.equal(await js("getComputedStyle(input).display"), "none");
  assert.equal(await js("getComputedStyle(inputPreview).display !== 'none'"), true);
  assert.equal(await js("inputPreview.querySelector('h1').textContent"), 'Draft');
  assert.equal(await js("inputPreview.querySelectorAll('li').length"), 2);
  assert.equal(await js("inputPreview.querySelector('strong').textContent"), 'simple');
  assert.equal(await js("inputPreview.querySelector('script') === null && !window.injected"), true, 'Raw HTML must stay as text');
  assert.equal(await js("document.querySelector('#grammar-section .section-title h2').textContent"), 'Grammar');
  assert.equal(await js("document.querySelector('#refine-section .section-title h2').textContent"), 'Refine');
  assert.equal(await js("document.querySelector('#grammar-results .translation em').textContent"), '中文');
  assert.equal(await js("document.querySelector('#grammar-results .note code').textContent"), 'note');
  await js("document.querySelector('#refine-results .copy').click()");
  await until(() => clipboard.readText() === '**refine** English.');
  assert.equal(await js(`window.renderMarkdown('[label](https://example.com) ![description](https://example.com/image.png)').includes('href=')`), false);
  assert.equal(await js(`window.renderMarkdown('![description](https://example.com/image.png)').includes('<img')`), false);
  await js("applyTheme('light'); input.value = '# A quiet page\\n\\nA **simple** paragraph.\\n\\n- A first thought\\n- A second thought'; showInputPreview(); resize()");
  await wait(150);
  fs.writeFileSync(path.join(out, 'markdown-paper.png'), (await win.capturePage()).toPNG());
  await js("inputPreview.click()");
  assert.equal(await js("document.activeElement === input && input.value.startsWith('# A quiet page')"), true, 'Clicking the preview must restore editable source');
  delete gates.grammar; delete gates.refine;
  await enter(('A paragraph with enough words to wrap over several lines. ').repeat(160));
  await until(() => gates.grammar && gates.refine);
  assert.equal(await js("input.scrollHeight > input.clientHeight"), true, 'Long drafts must scroll inside the editor');
  await js("document.getElementById('gear').click()");
  await until(() => js("!settingsEl.classList.contains('hidden')"));
  assert.equal(await js("document.querySelector('.shell').clientHeight <= innerHeight"), true, 'The paper must stay inside the window');
  await js("document.querySelector('.shell').scrollTop = 10000");
  assert.equal(await js("getComputedStyle(document.querySelector('.writing-area')).display"), "none", 'Settings must replace the draft instead of adding height below it');
  console.log('PASS: Markdown preview, headings, emphasis, lists, code, escaped HTML, safe links, source editing, paper editor, paragraph input, pause, matching font, long draft, scrolling,  copy controls, clipboard IPC, stable streaming buttons, one candidate, section failure, Enter, stale requests');
}
let savedClipboard;
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (savedClipboard !== undefined) clipboard.writeText(savedClipboard);
  fs.rmSync(dir, {recursive: true, force: true});
  app.exit(process.exitCode || 0);
});
