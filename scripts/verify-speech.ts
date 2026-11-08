// Runs the real app, preload, IPC and macOS speech service with deterministic suggestions.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, clipboard } = require("electron");
const speech = require("../src/main/speech");
const ollama = require("../src/main/ollama");
let refineCalls = 0;
let releaseStream;
let originalClipboard;

const temporaryData = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-speech-"));
app.setPath("userData", temporaryData);
process.env.LINLOOP_SHOW = "1";
ollama.refineStream = async ({ onModel, onToken }) => {
  refineCalls++;
  onModel("test-model:latest");
  if (refineCalls === 1) {
    onToken('{"results":[{"text":"Streamed');
    await new Promise((resolve) => { releaseStream = resolve; });
    onToken(' result","translation":"流式翻译","note":"streamed note"}],"learnings":' +
      '{"words":[],"patterns":[],"collocations":[]}}');
  } else {
    onToken('{"results":[{"text":"She went to school yesterday.","translation":"她昨天去上学了。"}],' +
      '"learnings":{"words":[],"patterns":[],"collocations":[]}}');
  }
  return {
    model: "test-model:latest",
    results: refineCalls === 1
      ? [{ text: "Streamed result", translation: "流式翻译", note: "streamed note" }]
      : [{ text: "She went to school yesterday.", translation: "她昨天去上学了。" }],
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
  assert.equal(app.dock.isVisible(), false);
  assert.equal(win.isAlwaysOnTop(), true);
  assert.equal(win.isVisibleOnAllWorkspaces(), true);
  // Desktop automation can change focus mid-check. Test the real hide handler explicitly below.
  win.removeAllListeners("blur");
  const js = (source) => win.webContents.executeJavaScript(source);
  await until(() => js("Boolean(window.linloop && document.getElementById('speak-input'))"));
  await delay(300);
  win.show();
  win.focus();
  assert.equal(await js("document.getElementById('speak-input').disabled"), true);
  await js(`
    document.getElementById('input').value = 'apple';
    document.getElementById('input').dispatchEvent(new Event('input'));
    document.getElementById('mode-grammar').click();
  `);
  await until(() => js("document.querySelector('.dictionary') && !document.querySelector('.dictionary').classList.contains('hidden')"));
  assert.equal(refineCalls, 0);
  assert.match(await js("document.querySelector('.dictionary').textContent"), /苹果/);
  await js(`
    document.getElementById('input').value = 'qwertyuiopasdf';
    document.getElementById('input').dispatchEvent(new Event('input'));
    document.getElementById('mode-grammar').click();
  `);
  await until(() => refineCalls === 1);
  await until(() => js("!document.getElementById('stream').classList.contains('hidden') && " +
    "document.getElementById('stream').textContent.includes('Streamed')"));
  assert.equal(await js("document.getElementById('stream-body').textContent.includes('流式翻译')"), false);
  const outputDir = path.join(__dirname, "../../out");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "stream-overlay.png"), (await win.capturePage()).toPNG());
  releaseStream();
  releaseStream = undefined;
  await until(() => refineCalls === 1 && js("document.querySelectorAll('.item').length === 1"));
  assert.equal(await js("document.querySelector('.item').textContent.includes('Streamed result')"), true);
  assert.equal(await js("document.querySelector('.dictionary').classList.contains('hidden')"), true);
  await js(`
    document.getElementById('input').value = 'give up';
    document.getElementById('input').dispatchEvent(new Event('input'));
    document.getElementById('mode-grammar').click();
  `);
  await until(() => js("document.querySelector('.dictionary').textContent.includes('认输')"));
  assert.equal(refineCalls, 1);
  fs.writeFileSync(path.join(outputDir, "dictionary-overlay.png"), (await win.capturePage()).toPNG());
  await js(`
    document.getElementById('input').value = 'She go to school yesterday';
    document.getElementById('input').dispatchEvent(new Event('input'));
    document.getElementById('mode-grammar').click();
  `);
  await until(() => refineCalls === 2 && js("document.querySelectorAll('.item').length === 1"));
  originalClipboard = clipboard.readText();
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
  await until(() => js(`document.getElementById('status').textContent === 'Copied. Paste anywhere.' &&
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
  console.log("verify-speech ok: native playback, dictionary-first, streamed LLM fallback, icon UI, rounded shell");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  speech.stop();
  if (originalClipboard !== undefined) clipboard.writeText(originalClipboard);
  fs.rmSync(temporaryData, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
