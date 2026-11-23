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
      message: { content: `{"results":[{"text":${JSON.stringify(body.messages.some(message => message.content.includes("Target language: French")) ? "Elle est allée à l’école hier." : "She went to school yesterday.")},"translation":"unfinished` },
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
  store.setSettings({ dictionaryFirst: false, model: "fixture" });
  require("../src/main/local-ai").connection = async () => ({ provider: "ollama", host: `http://127.0.0.1:${server.address().port}`, model: "fixture" });
  store.saveItems([{ kind: "word", term: "nonetheless" }]);
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
  prompts.length = 0;
  // French must bypass the English dictionary without a language setting.
  const dictionary = require("../src/main/dictionary");
  let lookups = 0;
  dictionary.lookup = async () => { lookups++; return null; };
  store.setSettings({ dictionaryFirst: true, language: "en" });
  assert.equal('language' in store.getSettings(), false, 'Legacy language settings must be ignored');
  assert.equal(await js("document.querySelector('#language, #writing-hint') === null && !input.hasAttribute('placeholder')"), true);
  await js("input.value = 'elle aller ecole hier'; input.dispatchEvent(new Event('input'))");
  await until(() => js("document.querySelectorAll('.text').length === 2 && [...document.querySelectorAll('.text')].every(el => el.textContent === 'Elle est allée à l’école hier.')"));
  await until(() => js("document.querySelectorAll('.translation').length === 2 && [...document.querySelectorAll('.translation')].every(el => el.textContent === '她昨天去上学了。')"));
  assert.equal(lookups, 0, "French must bypass the English dictionary");
  assert.equal(await js("document.querySelector('#refine-results .copy').title"), "Copy result");
  assert.ok(prompts.every(prompt => !prompt.includes("nonetheless")), 'French must not use the English bank');
  assert.ok(prompts.some(prompt => prompt.includes("Correct the French grammar")));
  assert.ok(prompts.some(prompt => prompt.includes("natural French")));
  assert.ok(prompts.some(prompt => prompt.includes("法语翻译成简体中文")));
  await js("document.querySelector('#refine-results .copy').click()");
  await until(() => clipboard.readText() === "Elle est allée à l’école hier.");
  const direct = await js("window.linloop.refine({text:'Je suis aller au travail ce matin', mode:'grammar'})");
  assert.equal(direct.results[0].text, "Elle est allée à l’école hier.", 'Non-streaming requests must also detect French');
  await store.init(dir);
  assert.equal('language' in store.getSettings(), false);
  prompts.length = 0;
  await js("input.value = 'She go to school yesterday'; input.dispatchEvent(new Event('input'))");
  assert.equal(await js("document.querySelectorAll('.result-row').length"), 0, 'A new input must replace the previous output');
  await until(() => js("document.querySelectorAll('.text').length === 2 && [...document.querySelectorAll('.text')].every(el => el.textContent === 'She went to school yesterday.')"));
  assert.ok(lookups > 0, 'English must return to dictionary lookup automatically');
  assert.ok(prompts.some(prompt => prompt.includes('Correct the English grammar')));
  assert.ok(prompts.some(prompt => prompt.includes('natural English')));
  assert.ok(prompts.some(prompt => prompt.includes('nonetheless')));
  assert.equal(await js("document.querySelectorAll('.result-row').length"), 2, 'Output must replace previous results, without history');
  console.log("PASS: automatic French and English detection, no language setting, dictionary bypass, bank isolation, replacement, translation, and copy");
  console.log("PASS: real HTTP client, truncated translation recovery, both result sections, and visible failure with English preserved");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
