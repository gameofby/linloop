const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("../src/main/store");
const ollama = require("../src/main/ollama");

async function main() {
  const parsed = ollama.stripJson('<think>nope</think>{"results":[{"text":"Hi.","note":"ok"}],"learnings":{}}');
  if (parsed.results[0].text !== "Hi.") throw new Error("stripJson failed");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-verify-"));
  await store.init(dir);
  store.saveItems([
    { kind: "word", term: "nonetheless", note: "in spite of that" },
    { kind: "pattern", term: "not only ... but also ...", example: "Not only is it short, but also clear." },
    { kind: "collocation", term: "make a decision" },
  ]);

  const settings = store.getSettings();
  const model = await ollama.resolveModel(settings.ollamaHost, settings.ollamaModel);
  console.log("using model", model);

  const grammar = await ollama.refine({
    host: settings.ollamaHost,
    model,
    mode: "grammar",
    text: "She go to school yesterday",
    bank: store.itemsByKind(),
  });
  if (!grammar.results.length) throw new Error("grammar returned no results");
  console.log("grammar", grammar.results[0].text);

  const refined = await ollama.refine({
    host: settings.ollamaHost,
    model,
    mode: "refine",
    text: "I need decide now",
    bank: store.itemsByKind(),
  });
  if (refined.results.length < 2) throw new Error("refine should return a few options");
  console.log("refine options", refined.results.length, refined.results.map((r) => r.text));

  const saved = store.saveItems(refined.learnings);
  console.log("saved learnings", saved.length);
  console.log("verify-flow ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
