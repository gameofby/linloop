// Checks the native macOS dictionary path and the UI fallback behavior.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const dictionary = require("../compiled/src/main/dictionary");

async function main() {
  assert.equal(process.platform, "darwin", "Run this check on macOS");
  execFileSync("bun", ["scripts/build-native.ts"], { cwd: path.join(__dirname, ".."), stdio: "inherit" });

  const apple = await dictionary.lookup("apple");
  assert.equal(apple.source, "牛津英汉汉英词典");
  assert.equal(apple.kind, "word");
  assert.match(apple.compact, /苹果/);
  assert.match(apple.phonetic, /æp/);
  assert.ok(apple.compact.length < 500, "Word definition should stay concise");

  const phrase = await dictionary.lookup("give up");
  assert.equal(phrase.kind, "collocation");
  assert.match(phrase.compact, /认输/);
  assert.match(phrase.compact, /放弃/);
  assert.ok(phrase.compact.length < 500, "Phrase should use a concise matching section");
  assert.equal(phrase.title, "give up");
  assert.doesNotMatch(phrase.compact, /rènshū/, "Do not mix pinyin into the concise definition");

  const collocation = await dictionary.lookup("look forward to");
  assert.equal(collocation.title, "look forward to");
  assert.match(collocation.compact, /await something eagerly/i);

  const idiom = await dictionary.lookup("break the ice");
  assert.equal(idiom.title, "break the ice");
  assert.match(idiom.compact, /relieve tension/i);

  assert.equal(await dictionary.lookup("xyzabc123"), null);
  assert.equal(dictionary.isLookupInput("apple", "grammar"), true);
  assert.equal(dictionary.isLookupInput("give up", "grammar"), true);
  assert.equal(dictionary.isLookupInput("I gave up.", "grammar"), false);
  assert.equal(
    dictionary.nativeHelperPath("/Applications/Linloop.app/Contents/Resources/app.asar/compiled/src/main"),
    "/Applications/Linloop.app/Contents/Resources/app.asar.unpacked/compiled/native/linloop-dictionary",
  );

  const html = fs.readFileSync(path.join(__dirname, "../src/renderer/index.html"), "utf8");
  assert.match(html, /id="speak-input"[^>]*aria-label="Pronounce input"/);
  assert.match(html, /<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(html, />Listen</, "Speech controls should use icons");
  assert.doesNotMatch(html, /class="grip"/, "The input must not have a leading grip icon");
  assert.doesNotMatch(html, /id="mode-grammar"/, "Grammar must be an output section");
  assert.match(html, /id="grammar-section"[^>]*>[\s\S]*Grammar correction/);
  assert.match(html, /id="refine-section"[^>]*>[\s\S]*Refine/);
  const css = fs.readFileSync(path.join(__dirname, "../src/renderer/styles.css"), "utf8");
  assert.doesNotMatch(css, /box-shadow/, "The shell must not have a shadow");
  assert.match(css, /\.shell\s*\{[^}]*margin:\s*0/s);
  assert.match(css, /\.shell\s*\{[^}]*border-radius:\s*16px/s);
  assert.doesNotMatch(css, /\.grip\s*\{/, "The grip styles must be removed");
  assert.match(css, /:not\(\.speech\)\s*\{/, "Speech controls keep the icon-only style");

  console.log("verify-dictionary ok: native lookup, concise entries, icon, rounded shell, output sections");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
