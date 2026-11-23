import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const { LocalAI, DEFAULT_MODEL, parseModel, downloadVerified } = require("../src/main/local-ai");
const ollama = require("../src/main/ollama");

async function run() {
  const root = mkdtempSync(join(tmpdir(), "linloop-local-ai-"));
  const originalFetch = globalThis.fetch;
  const ai = new LocalAI(root);
  try {
    assert.equal(DEFAULT_MODEL, "qwen2.5:0.5b");
    assert.equal(parseModel("qwen3:0.6b").provider, "ollama");
    for (const value of ["", "../bad", "-bad", "/tmp/model", "https://example.com/model", "bad;command", "user/model", "mlx-community/Qwen2.5-0.5B-Instruct-4bit", "registry.example.com/library/model"]) {
      assert.throws(() => parseModel(value), /Ollama library/);
    }
    assert.equal(ai.environment().ELECTRON_RUN_AS_NODE, undefined);
    let running = false, starts = 0, runtimeInstalls = 0;
    const names = [DEFAULT_MODEL];
    ai.ollamaBinary = () => "/already-installed/ollama";
    ai.models = async () => running ? [...names] : null;
    ai.launch = () => { starts++; running = true; return { exited: false, child: { kill() {} } }; };
    const state = await ai.status(DEFAULT_MODEL);
    assert.equal(state.ready, true, 'A stopped service must not hide its already installed models');
    assert.equal(starts, 1);
    let pulls = 0;
    globalThis.fetch = (async (url, options) => {
      assert.ok(String(url).endsWith("/api/pull"));
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "registry.ollama.ai/library/qwen3:0.6b");
      pulls++;
      names.push("qwen3:0.6b");
      return new Response('{"status":"success"}\n');
    }) as typeof fetch;
    await ai.setup(DEFAULT_MODEL);
    assert.equal(pulls, 0, 'Repeat initialization must not pull a cached default model');
    ai.installRuntime = async () => { runtimeInstalls++; throw new Error('Runtime installation is forbidden in model download'); };
    await ai.downloadModel("qwen3:0.6b");
    assert.equal(runtimeInstalls, 0);
    assert.equal(pulls, 1);
    await ai.downloadModel("qwen3:0.6b");
    assert.equal(pulls, 1, 'An existing added model must also skip the pull');
    await assert.rejects(ai.requireModel("qwen3:8b"), /Download/);
    assert.equal(pulls, 1, 'Selecting a missing model must never download it');
    assert.equal(await ai.requireModel("qwen3:0.6b"), "qwen3:0.6b");
    assert.throws(() => ai.setup("qwen3:0.6b"), /default model/);

    const missing = new LocalAI(root);
    missing.ollamaBinary = () => undefined;
    missing.models = async () => null;
    missing.installRuntime = async () => { runtimeInstalls++; };
    await assert.rejects(missing.downloadModel("qwen3:0.6b"), /set up Ollama first/);
    assert.equal(runtimeInstalls, 0, 'Adding a model before setup must not install Ollama');

    const bytes = Buffer.from("a verified runtime archive");
    const release = { url: "https://fixture/runtime", sha256: createHash("sha256").update(bytes).digest("hex") };
    const target = join(root, "runtime.tgz");
    await downloadVerified(release, target, () => {}, async () => new Response(bytes));
    assert.ok(existsSync(target));
    await assert.rejects(downloadVerified({ ...release, sha256: "bad" }, target, () => {}, async () => new Response(bytes)), /checksum/);
    assert.equal(existsSync(target + ".partial"), false);
    globalThis.fetch = (async () => Response.json({ models: [{ name: "other-model" }] })) as typeof fetch;
    await assert.rejects(ollama.resolveModel("http://fixture", "selected-model"), /selected model is not installed/);
    globalThis.fetch = originalFetch;
    const store = require("../src/main/store");
    const legacy = join(root, "legacy");
    await store.init(legacy);
    store.saveItems([{ kind: "word", term: "nonetheless" }]);
    const SQL = await require("sql.js")({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    const file = join(legacy, "linloop.sqlite");
    const db = new SQL.Database(readFileSync(file));
    db.run("UPDATE settings SET value = ? WHERE key = 'model'", ["mlx-community/Qwen2.5-0.5B-Instruct-4bit"]);
    writeFileSync(file, Buffer.from(db.export())); db.close();
    await store.init(legacy);
    assert.equal(store.getSettings().model, DEFAULT_MODEL, 'An older MLX selection must migrate to the official Ollama default');
    assert.equal(store.listItems()[0].term, "nonetheless", 'Migration must preserve vocabulary');
    console.log("PASS: official-library-only downloads, existing runtime and model reuse, stopped service detection, separate initialization and model download, cached download skip, missing-model selection, and runtime checksums");
  } finally { globalThis.fetch = originalFetch; ai.stop(); rmSync(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
