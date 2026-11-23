const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const localAI = require("../src/main/local-ai");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-ai-settings-"));
app.setPath("userData", dir);
let finish, fail, progress;
let attempts = 0;
localAI.status = async model => ({ ...localAI.parseModel(model), installed: false, ready: false, busy: false, message: "Install local AI and download the selected model." });
localAI.setup = async (model, report) => {
  attempts++;
  progress = report;
  report("Downloading model… 25%");
  await new Promise((resolve, reject) => { finish = resolve; fail = reject; });
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let n = 0; n < 200; n++) { if (await check()) return; await wait(25); }
  throw new Error("Timed out waiting for AI settings");
}
async function run() {
  await app.whenReady();
  require("../src/main/main");
  await until(() => BrowserWindow.getAllWindows().length);
  const win = BrowserWindow.getAllWindows()[0];
  await until(() => !win.webContents.isLoading());
  const js = code => win.webContents.executeJavaScript(code);
  const store = require("../src/main/store");
  assert.equal(store.getSettings().model, localAI.DEFAULT_MODEL);
  assert.equal("ollamaHost" in store.getSettings(), false);
  await js("document.getElementById('gear').click()");
  await until(() => js("!document.getElementById('ai-install').disabled"));
  assert.equal(await js("document.getElementById('host') === null"), true);
  assert.equal(await js("document.getElementById('model').value"), localAI.DEFAULT_MODEL);
  await js("document.getElementById('model').value = 'qwen2.5:0.5b'; document.getElementById('model').dispatchEvent(new Event('input'))");
  await until(() => js("!document.getElementById('ai-install').disabled"));
  await js("document.getElementById('ai-install').click()");
  await until(() => attempts === 1);
  assert.equal(await js("document.getElementById('model').disabled && document.getElementById('settings-save').disabled"), true);
  assert.equal(await js("document.getElementById('ai-status').textContent"), "Downloading model… 25%");
  fail(new Error("Connection interrupted. Retry setup."));
  await until(() => js("!document.getElementById('ai-install').disabled"));
  assert.equal(await js("document.getElementById('ai-status').textContent"), "Connection interrupted. Retry setup.");
  await js("document.getElementById('ai-install').click()");
  await until(() => attempts === 2);
  progress("Ready"); finish();
  await until(() => js("!document.getElementById('model').disabled"));
  assert.equal(store.getSettings().model, "qwen2.5:0.5b");
  win.showInactive();
  await wait(150);
  fs.mkdirSync(path.join(process.cwd(), "out"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "out/ai-settings.png"), (await win.capturePage()).toPNG());
  await js("document.getElementById('model').value = '../bad'; document.getElementById('model').dispatchEvent(new Event('input'))");
  await wait(400);
  assert.equal(await js("document.getElementById('ai-install').disabled"), true);
  assert.match(await js("document.getElementById('ai-status').textContent"), /valid model/);
  console.log("PASS: smallest Qwen default, no host configuration, install IPC, progress, duplicate prevention, failure, retry, saved model, and validation");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(dir, { recursive: true, force: true }); app.exit(process.exitCode || 0);
});
