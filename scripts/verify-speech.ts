// Runs the real app, preload, IPC and macOS speech service with deterministic suggestions.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, clipboard } = require("electron");
const speech = require("../src/main/speech");
const ollama = require("../src/main/ollama");
const nativeSpeak = speech.speak;
let lastSpoken;
speech.speak = (text) => {
  lastSpoken = text;
  return nativeSpeak(text);
};
let refineCalls = 0;
let releaseGrammar;
let releaseRefine;
let originalClipboard;

const temporaryData = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-speech-"));
app.setPath("userData", temporaryData);
process.env.LINLOOP_SHOW = "1";
ollama.refineStream = async ({ mode, text, onModel, onToken }) => {
  refineCalls++;
  onModel("test-model:latest");
  if (text === "qwertyuiopasdf") {
    if (mode === "grammar") {
      onToken('{"results":[{"text":"Streamed grammar');
      await new Promise((resolve) => { releaseGrammar = resolve; });
      onToken(' result","translation":"语法翻译","note":"grammar note"}],"learnings":' +
        '{"words":[],"patterns":[],"collocations":[]}}');
    } else {
      onToken('{"results":[{"text":"Streamed refine');
      await new Promise((resolve) => { releaseRefine = resolve; });
      onToken(' result","translation":"改写翻译","note":"refine note"},' +
        '{"text":"Second refine","translation":"第二条","note":"second note"}],' +
        '"learnings":{"words":[],"patterns":[],"collocations":[]}}');
    }
  } else if (mode === "grammar") {
    onToken('{"results":[{"text":"She went to school yesterday.","translation":"她昨天去上学了。",' +
      '"note":"Corrected the past tense."}],"learnings":{"words":[],"patterns":[],"collocations":[]}}');
  } else {
    onToken('{"results":[{"text":"She went to school yesterday.","translation":"她昨天去上学了。",' +
      '"note":"Natural correction."},{"text":"Yesterday, she went to school.","translation":"昨天，她去上学了。"}],' +
      '"learnings":{"words":[],"patterns":[],"collocations":[]}}');
  }
  const firstBatch = text === "qwertyuiopasdf";
  return {
    model: "test-model:latest",
    results: mode === "grammar"
      ? [{
          text: firstBatch ? "Streamed grammar result" : "She went to school yesterday.",
          translation: firstBatch ? "语法翻译" : "她昨天去上学了。",
          note: firstBatch ? "grammar note" : "Corrected the past tense.",
        }]
      : firstBatch
        ? [
            { text: "Streamed refine result", translation: "改写翻译", note: "refine note" },
            { text: "Second refine", translation: "第二条", note: "second note" },
          ]
        : [
            { text: "She went to school yesterday.", translation: "她昨天去上学了。", note: "Natural correction." },
            { text: "Yesterday, she went to school.", translation: "昨天，她去上学了。" },
          ],
    learnings: [],
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error("Timed out waiting for speech UI");
}

app.whenReady().then(async () => {
  assert.equal(process.platform, "darwin", "Run this check on macOS");
  await assert.rejects(speech.speak("   "), /Type a sentence/);
  await assert.rejects(speech.speak({ text: "bad payload" }), /Type a sentence/);
  await assert.rejects(speech.speak("x".repeat(20001)), /20,000/);
  assert.deepEqual(await speech.speak("Hello."), { stopped: false });
  const replaced = speech.speak("This is a long sentence. ".repeat(30));
  await delay(150);
  const replacement = speech.speak("Hello again.");
  assert.deepEqual(await replaced, { stopped: true });
  assert.deepEqual(await replacement, { stopped: false });

  // Finish native checks before the overlay's startup focus/hide events can cancel them.
  require("../src/main/main");
  await until(() => BrowserWindow.getAllWindows().length > 0);
  const win = BrowserWindow.getAllWindows()[0];
  assert.equal(app.dock.isVisible(), true);
  assert.equal(win.isAlwaysOnTop(), true);
  assert.equal(win.isVisibleOnAllWorkspaces(), true);
  const js = (source) => win.webContents.executeJavaScript(source);
  await until(() => js("Boolean(window.linloop && document.getElementById('speak-input'))"));
  await delay(300);
  win.show();
  win.focus();
  assert.equal(await js("document.getElementById('speak-input').disabled"), true);
  await js(`
    document.getElementById('input').value = 'apple';
    document.getElementById('input').dispatchEvent(new Event('input'));
  `);
  await until(() => js("document.querySelector('.dictionary') && !document.querySelector('.dictionary').classList.contains('hidden')"));
  assert.equal(refineCalls, 0);
  assert.match(await js("document.querySelector('.dictionary').textContent"), /苹果/);
  originalClipboard = clipboard.readText();
  clipboard.writeText("dictionary test clipboard");
  const dictionaryLabel = await js("document.querySelector('.dictionary-pronounce').textContent");
  assert.match(await js("document.querySelector('.dictionary-phonetic').textContent"), /æp/);
  await js("document.querySelector('.dictionary-phonetic').click()");
  await until(() => js("document.querySelector('.dictionary-pronounce').classList.contains('playing')"));
  assert.equal(lastSpoken, "apple", "Pronounce the English title, without IPA or definitions");
  assert.equal(await js("document.querySelector('.dictionary-pronounce').getAttribute('aria-label')"), "Stop pronunciation");
  assert.equal(await js("document.querySelector('.dictionary-pronounce').textContent"), dictionaryLabel,
    "The word and IPA must remain visible during playback");
  assert.equal(clipboard.readText(), "dictionary test clipboard", "Dictionary pronunciation must not copy");
  await js("document.querySelector('.dictionary-word').click()");
  await until(() => js("!document.querySelector('.dictionary-pronounce').classList.contains('playing')"));
  assert.equal(await js("document.querySelector('.dictionary-pronounce').getAttribute('aria-label')"), "Pronounce dictionary word");
  const dictionaryOutput = path.join(__dirname, "../../out");
  fs.mkdirSync(dictionaryOutput, { recursive: true });
  fs.writeFileSync(path.join(dictionaryOutput, "dictionary-pronunciation.png"), (await win.capturePage()).toPNG());
  await js("document.querySelector('.dictionary-pronounce .speech-icon').click()");
  await until(() => js("document.querySelector('.dictionary-pronounce').classList.contains('playing')"));
  win.hide();
  await until(() => js("!document.querySelector('.dictionary-pronounce').classList.contains('playing')"));
  win.show();
  await js(`
    document.getElementById('input').value = 'qwertyuiopasdf';
    document.getElementById('input').dispatchEvent(new Event('input'));
  `);
  await until(() => refineCalls === 2);
  await until(() => js("document.querySelector('#grammar-results').textContent.includes('Streamed grammar')"));
  await until(() => js("document.querySelector('#refine-results').textContent.includes('Streamed refine')"));
  assert.equal(await js("document.getElementById('mode-grammar') === null"), true);
  assert.equal(await js("document.querySelector('#grammar-section .section-title').textContent"), "Grammar correction");
  assert.equal(await js("document.querySelector('#refine-section .section-title').textContent"), "Refine");
  assert.equal(await js("document.getElementById('stream') === null"), true);
  const outputDir = path.join(__dirname, "../../out");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "stream-overlay.png"), (await win.capturePage()).toPNG());
  releaseGrammar();
  releaseRefine();
  releaseGrammar = undefined;
  releaseRefine = undefined;
  await until(() => js("document.querySelectorAll('.item').length === 2"));
  assert.equal(await js("document.querySelector('#grammar-results').textContent.includes('Streamed grammar result')"), true);
  assert.equal(await js("document.querySelector('#refine-results').textContent.includes('Second refine')"), false);
  assert.equal(await js("document.querySelector('.dictionary').classList.contains('hidden')"), true);
  await js(`
    document.getElementById('input').value = 'give up';
    document.getElementById('input').dispatchEvent(new Event('input'));
  `);
  await until(() => js("document.querySelector('.dictionary').textContent.includes('认输')"));
  assert.equal(refineCalls, 2);
  await js("document.querySelector('.dictionary-word').click()");
  await until(() => js("document.querySelector('.dictionary-pronounce').classList.contains('playing')"));
  assert.equal(lastSpoken, "give up", "Dictionary phrases must use the English title");
  fs.writeFileSync(path.join(outputDir, "dictionary-overlay.png"), (await win.capturePage()).toPNG());
  await js(`
    document.getElementById('input').value = 'She go to school yesterday';
    document.getElementById('input').dispatchEvent(new Event('input'));
  `);
  await until(async () => refineCalls === 4 && await js("document.querySelectorAll('.item').length === 2"));
  clipboard.writeText("speech test clipboard");
  await js("document.getElementById('speak-input').click()");
  await until(() => js("document.getElementById('speak-input').classList.contains('playing')"));
  await delay(150);
  await js("document.querySelector('.result-row .speech').click()");
  await delay(150);
  assert.equal(await js("document.getElementById('speak-input').classList.contains('playing')"), false);
  assert.equal(await js("document.querySelector('.result-row .speech').classList.contains('playing')"), true,
    JSON.stringify({ visible: win.isVisible(), status: await js("document.getElementById('status').textContent") }));
  assert.equal(clipboard.readText(), "speech test clipboard", "Listening must not copy");
  await js("document.querySelector('.result-row .speech').click()");
  await until(() => js("!document.querySelector('.result-row .speech').classList.contains('playing')"));
  await js("document.querySelector('.item').click()");
  await until(() => clipboard.readText() === "She went to school yesterday.");
  await until(() => js(`document.getElementById('status').classList.contains('hidden') &&
    document.querySelector('#grammar-results .copy').textContent === 'Copied' &&
    document.querySelector('.shell').getBoundingClientRect().bottom <= window.innerHeight`));
  await delay(150); // Let the resized native window finish painting before capture.
  fs.writeFileSync(path.join(outputDir, "speech-overlay.png"), (await win.capturePage()).toPNG());

  // Editing the sentence and hiding the real overlay both cancel native playback.
  await js("document.getElementById('speak-input').click()");
  await delay(100);
  await js("document.getElementById('input').dispatchEvent(new Event('input'))");
  await until(() => js("!document.getElementById('speak-input').classList.contains('playing')"));
  await js("document.getElementById('speak-input').click()");
  await delay(100);
  win.hide();
  await until(() => js("!document.getElementById('speak-input').classList.contains('playing')"));
  await js(`
    document.getElementById('input').value = 'x'.repeat(20001);
    document.getElementById('speak-input').click();
  `);
  await until(() => js("document.getElementById('status').textContent.includes('20,000')"));
  assert.equal(await js("document.getElementById('speak-input').classList.contains('playing')"), false);
  assert.equal(await js("getComputedStyle(document.querySelector('.shell')).boxShadow"), "none");
  assert.equal(await js("getComputedStyle(document.querySelector('.shell')).marginTop"), "0px");
  assert.equal(await js("getComputedStyle(document.querySelector('.shell')).borderRadius"), "16px");
  assert.equal(await js("document.querySelector('.grip') === null"), true);
  assert.equal(await js("document.querySelector('.speech').querySelectorAll('svg').length > 0"), true);
  assert.equal(await js("getComputedStyle(document.querySelector('.speech')).backgroundColor"), "rgba(0, 0, 0, 0)");
  console.log("verify-speech ok: native playback, dictionary word/IPA/icon pronunciation, stop, phrases, clipboard, dictionary-first, streamed LLM fallback, icon UI, rounded shell");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  speech.stop();
  if (originalClipboard !== undefined) clipboard.writeText(originalClipboard);
  fs.rmSync(temporaryData, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
