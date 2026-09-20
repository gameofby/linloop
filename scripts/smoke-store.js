const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("../src/main/store");

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linloop-"));
  await store.init(dir);
  const settings = store.setSettings({ ollamaModel: "llama3.2" });
  if (settings.hotkey !== "CommandOrControl+Shift+L") throw new Error("default hotkey missing");
  const saved = store.saveItems([
    { kind: "word", term: "nonetheless", note: "in spite of that" },
    { kind: "pattern", term: "not only ... but also ...", example: "Not only is it short, but also clear." },
    { kind: "collocation", term: "make a decision", example: "We need to make a decision." },
    { kind: "word", term: "  " },
  ]);
  if (saved.length !== 3) throw new Error("expected 3 saved items");
  const bank = store.itemsByKind();
  if (bank.word.length !== 1 || bank.pattern.length !== 1 || bank.collocation.length !== 1) {
    throw new Error("bank grouping failed");
  }
  console.log("store ok", dir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
