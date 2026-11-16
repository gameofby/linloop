const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { app, BrowserWindow } = require("electron");

// Use the real Ollama client, main process, preload, and renderer. Only the
// model server is a fixture, so this check needs no installed model.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-translation-"));
app.setPath("userData", dir);
let failTranslation = false;
let translationRequests = 0;
const server = http.createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/api/tags") {
    response.end(JSON.stringify({ models: [{ name: "fixture" }] }));
    return;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  if (body.format.properties.translation) {
    translationRequests++;
    if (failTranslation) {
      response.writeHead(503);
      response.end('{}');
      return;
    }
    response.end(JSON.stringify({ message: { content: '{"translation":"她昨天去上学了。"}' } }));
  } else {
    response.end(JSON.stringify({
      message: { content: '{"results":[{"text":"She went to school yesterday.","translation":"unfinished' },
      done: true,
    }) + "\n");
  }
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 400; i++) {
    if (await check()) return;
    await wait(25);
  }
  throw new Error("Timed out waiting for translation");
}
async function run() {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  await app.whenReady();
  const store = require("../src/main/store");
  await store.init();
  store.setSettings({ dictionaryFirst: false, ollamaHost: `http://127.0.0.1:${server.address().port}`, ollamaModel: "fixture" });
  require("../src/main/main");
  await until(() => BrowserWindow.getAllWindows().length);
  const win = BrowserWindow.getAllWindows()[0];
  await until(() => !win.webContents.isLoading());
  const js = code => win.webContents.executeJavaScript(code);
  await js("input.value = 'She go to school yesterday'; input.dispatchEvent(new Event('input'))");
  await until(() => js("document.querySelectorAll('.translation').length === 2 && [...document.querySelectorAll('.translation')].every(el => el.textContent === '她昨天去上学了。')"));
  assert.equal(translationRequests, 2, "Both result sections must recover their missing translation");
  failTranslation = true;
  await js("input.value = 'She go to school yesterday again'; input.dispatchEvent(new Event('input'))");
  await until(() => js("document.querySelectorAll('.translation').length === 2 && [...document.querySelectorAll('.translation')].every(el => el.textContent.includes('Translation unavailable'))"));
  assert.equal(await js("[...document.querySelectorAll('.item .text')].every(el => el.textContent === 'She went to school yesterday.')"), true,
    "A failed translation must preserve both English results");
  assert.equal(translationRequests, 4);
  console.log("PASS: real HTTP client, truncated translation recovery, both result sections, and visible failure with English preserved");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
