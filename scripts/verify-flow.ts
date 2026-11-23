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
  const ai = new (require("../src/main/local-ai").LocalAI)(path.join(os.homedir(), "Library/Application Support/linloop/local-ai"));
  const connection = await ai.connection(settings.model);
  console.log("using model", connection.displayModel || connection.model);

  const grammar = await ollama.refine({
    ...connection,
    mode: "grammar",
    text: "She go to school yesterday",
    bank: store.itemsByKind(),
  });
  if (!grammar.results.length) throw new Error("grammar returned no results");
  console.log("grammar", grammar.results[0].text);

  let streamChunks = 0;
  const streamed = await ollama.refineStream({
    ...connection,
    mode: "grammar",
    text: "She go to school yesterday",
    bank: store.itemsByKind(),
    onToken: () => { streamChunks++; },
  });
  if (!streamChunks) throw new Error("stream returned no chunks");
  if (!streamed.results.length) throw new Error("stream returned no results");
  console.log("stream chunks", streamChunks);

  const refined = await ollama.refine({
    ...connection,
    mode: "refine",
    text: "I need decide now",
    bank: store.itemsByKind(),
  });
  if (refined.results.length !== 1) throw new Error("refine must return one option");
  console.log("refine options", refined.results.length, refined.results.map((r) => r.text));

  const saved = store.saveItems(refined.learnings);
  console.log("saved learnings", saved.length);
  ai.stop();
  console.log("verify-flow ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
