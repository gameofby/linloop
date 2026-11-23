import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { LocalAI } = require("../src/main/local-ai");

async function run() {
  const root = mkdtempSync(join(tmpdir(), "linloop-reuse-"));
  const originalFetch = globalThis.fetch;
  const ai = new LocalAI(root);
  let pulls = 0;
  ai.ollamaBinary = () => "/already-installed/ollama";
  ai.models = async () => ["qwen2.5:0.5b"];
  globalThis.fetch = (async (_url, options) => {
    if (options?.method === "POST") pulls++;
    return new Response('{"status":"success"}\n');
  }) as typeof fetch;
  try {
    await ai.setup("qwen2.5:0.5b");
    assert.equal(pulls, 0, 'Already installed default model must not be pulled again');
    console.log("PASS: repeat initialization makes no model download request");
  } finally { globalThis.fetch = originalFetch; ai.stop(); rmSync(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
