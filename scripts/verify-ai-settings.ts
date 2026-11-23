const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const localAI = require("../src/main/local-ai");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-ai-settings-"));
app.setPath("userData", dir);
let finish, fail;
let initialized = 0, downloads = 0, installed = false;
const models = [];
localAI.status = async model => ({ ...localAI.parseModel(model), installed,
  ready: models.includes(model), defaultReady: models.includes(localAI.DEFAULT_MODEL), models: [...models], busy: false,
  message: installed ? "Ready" : "Not installed" });
localAI.initialize = async report => {
  initialized++; report("Preparing Ollama…");
  await new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  installed = true; models.push(localAI.DEFAULT_MODEL);
};
localAI.downloadModel = async (model, report) => {
  downloads++; report("Downloading… 25%");
  await new Promise(resolve => { finish = resolve; });
  models.push(model);
};
localAI.requireModel = async model => { assert.ok(models.includes(model)); return model; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let n = 0; n < 200; n++) { if (await check()) return; await wait(25); }
  throw new Error("Timed out waiting for settings");
}
async function run() {
  await app.whenReady();
  require("../src/main/main");
  await until(() => BrowserWindow.getAllWindows().length);
  const win = BrowserWindow.getAllWindows()[0];
  await until(() => !win.webContents.isLoading());
  const js = code => win.webContents.executeJavaScript(code);
  const store = require("../src/main/store");
  const out = path.join(process.cwd(), "out"); fs.mkdirSync(out, { recursive: true });
  win.showInactive();
  await js("input.value = 'A quiet space to write.'; resize(); updateSpeechControls()");
  const alignment = await js("({input:input.getBoundingClientRect().top, actions:document.querySelector('.bar').getBoundingClientRect().top, height:innerHeight})");
  assert.ok(Math.abs(alignment.input - alignment.actions) < 2, 'Toolbar must align with the first input line');
  assert.ok(alignment.input < 30, 'Input must start near the top without a separate toolbar row');
  assert.ok(alignment.height <= 200, 'The empty paper must not reserve a large blank window');
  await wait(100); fs.writeFileSync(path.join(out, "compact-paper.png"), (await win.capturePage()).toPNG());
  await js("input.value = ''; document.getElementById('gear').click()");
  await until(() => js("document.getElementById('ai-status').textContent === 'Not installed'"));
  assert.equal(await js("getComputedStyle(document.querySelector('.writing-area')).display"), 'none', 'Settings must replace the editor');
  assert.equal(await js("document.querySelectorAll('#settings details[open]').length"), 0);
  assert.equal(await js("document.querySelector('#host, #ai-install') === null"), true);
  await js("document.getElementById('ai-initialize').click()");
  await until(() => initialized === 1);
  await js("document.getElementById('ai-initialize').click()");
  assert.equal(initialized, 1);
  fail(new Error("Connection interrupted. Retry setup."));
  await until(() => js("document.getElementById('ai-status').textContent.includes('Connection interrupted')"));
  await js("document.getElementById('ai-initialize').click()");
  await until(() => initialized === 2);
  finish();
  await until(() => js("document.getElementById('ai-initialize').classList.contains('hidden')"));
  assert.equal(store.getSettings().model, localAI.DEFAULT_MODEL);
  assert.equal(await js("document.getElementById('model').value"), localAI.DEFAULT_MODEL);
  await wait(100); fs.writeFileSync(path.join(out, "compact-settings.png"), (await win.capturePage()).toPNG());
  await js("document.getElementById('model-download-panel').open = true; document.getElementById('model-download').value = 'qwen3:0.6b'; document.getElementById('ai-download').click()");
  await until(() => downloads === 1);
  assert.equal(initialized, 2, 'Adding a model must not initialize Ollama again');
  assert.equal(store.getSettings().model, localAI.DEFAULT_MODEL, 'Downloading must not switch the model');
  assert.equal(await js("document.getElementById('model-download-status').textContent"), "Downloading… 25%");
  finish();
  await until(() => js("document.querySelector('#model option[value=\"qwen3:0.6b\"]') !== null && !document.getElementById('model').disabled"));
  assert.equal(store.getSettings().model, localAI.DEFAULT_MODEL);
  await js("document.getElementById('model').value = 'qwen3:0.6b'; document.getElementById('model').dispatchEvent(new Event('change'))");
  await until(() => store.getSettings().model === "qwen3:0.6b");
  await until(() => js("!document.getElementById('model').disabled"));
  assert.equal(initialized, 2); assert.equal(downloads, 1);
  await js("document.getElementById('model-download').value = 'user/model'; document.getElementById('ai-download').click()");
  await until(() => js("document.getElementById('model-download-status').textContent.includes('Ollama library')"));
  assert.equal(downloads, 1, 'Namespaced third-party models must be rejected before download');
  await js("document.getElementById('settings-close').click(); document.getElementById('gear').click()");
  await until(() => js("document.getElementById('ai-status').textContent === 'Ready'"));
  assert.equal(initialized, 2, 'Reopening settings must not install again');
  assert.equal(await js("document.getElementById('ai-initialize').classList.contains('hidden')"), true);
  console.log("PASS: compact aligned editor, separate settings view, collapsed preferences, reused installation, initialization retry, independent download and selection, and official-only model downloads");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
