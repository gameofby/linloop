const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { app, BrowserWindow, clipboard } = require("electron");

// Use the real Ollama client, main process, preload, and renderer. Only the
// model server is a fixture, so this check needs no installed model.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-translation-"));
app.setPath("userData", dir);
let failTranslation = false;
let translationRequests = 0;
let language = "en";
const prompts = [];
const server = http.createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/api/tags") {
    response.end(JSON.stringify({ models: [{ name: "fixture" }] }));
    return;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  prompts.push(body.messages.map(message => message.content).join("\n"));
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
      message: { content: `{"results":[{"text":${JSON.stringify(language === "fr" ? "Elle est allée à l’école hier." : "She went to school yesterday.")},"translation":"unfinished` },
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
  failTranslation = false;
  language = "fr";
  prompts.length = 0;
  // Leave dictionary lookup enabled. French must bypass the English dictionary.
  const dictionary = require("../src/main/dictionary");
  let lookups = 0;
  dictionary.lookup = async () => { lookups++; return { title: "wrong English entry" }; };
  await js("document.getElementById('gear').click()");
  await until(() => js("!document.getElementById('settings').classList.contains('hidden')"));
  await js("document.getElementById('language').value = 'fr'; document.getElementById('dictionary-first').checked = true; document.getElementById('settings-save').click()");
  await until(() => js("document.getElementById('settings').classList.contains('hidden')"));
  await js("input.value = 'elle aller école hier'; input.dispatchEvent(new Event('input'))");
  await until(() => js("document.querySelectorAll('.translation').length === 2 && [...document.querySelectorAll('.translation')].every(el => el.textContent === '她昨天去上学了。')"));
  assert.equal(lookups, 0, "French must bypass the English dictionary");
  assert.match(await js("input.placeholder"), /Type French/);
  assert.equal(await js("document.querySelector('#refine-results .copy').title"), "Copy French");
  assert.ok(prompts.some(prompt => prompt.includes("Correct the French grammar")));
  assert.ok(prompts.some(prompt => prompt.includes("natural French")));
  assert.ok(prompts.some(prompt => prompt.includes("Translate this French text")));
  await js("document.querySelector('#refine-results .copy').click()");
  await until(() => clipboard.readText() === "Elle est allée à l’école hier.");
  await store.init(dir);
  assert.equal(store.getSettings().language, "fr", "Practice language must survive a database reload");
  // A language change must discard old results and ignore pending requests.
  await js("document.getElementById('gear').click()");
  await until(() => js("!document.getElementById('settings').classList.contains('hidden')"));
  await js("input.value = ''; document.getElementById('language').value = 'en'; document.getElementById('settings-save').click()");
  await until(() => js("input.placeholder.includes('Type English')"));
  assert.equal(await js("document.querySelectorAll('.result-row').length"), 0);
  console.log("PASS: French settings, prompts, dictionary bypass, translations, copy, persistence, and language reset");
  console.log("PASS: real HTTP client, truncated translation recovery, both result sections, and visible failure with English preserved");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
