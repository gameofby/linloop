import assert from "node:assert/strict";
const { detectLanguage } = require("../src/main/language");

async function run() {
  for (const [text, expected] of [
    ["She go to school yesterday", "en"],
    ["I need decide now", "en"],
    ["apple", "en"],
    ["Elle aller a ecole hier", "fr"],
    ["Je suis aller au travail ce matin", "fr"],
    ["Bonjour", "fr"],
    ["Je voudrais améliorer mon français.", "fr"],
    ["# Mes notes\n\nJe suis aller au travail ce matin.", "fr"],
    ["# My notes\n\nI went to work this morning.", "en"],
    ["This is English again.", "en"],
  ]) {
    assert.equal(await detectLanguage(text), expected, text);
  }
  console.log("PASS: native English and French detection, short text, missing accents, Markdown, and language switches");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
