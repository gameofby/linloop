import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const { LocalAI, DEFAULT_MODEL, parseModel, downloadVerified } = require("../src/main/local-ai");
const ollama = require("../src/main/ollama");

async function run() {
  const root = mkdtempSync(join(tmpdir(), "linloop-local-ai-"));
  const originalFetch = globalThis.fetch;
  try {
    assert.equal(parseModel("qwen2.5:0.5b").provider, "ollama");
    assert.equal(parseModel("mlx-community/Qwen2.5-0.5B-Instruct-4bit", "arm64").provider, "mlx");
    assert.throws(() => parseModel("mlx-community/Qwen2.5-0.5B-Instruct-4bit", "x64"), /Apple Silicon/);
    for (const value of ["", "../bad", "-bad", "/tmp/model", "https://example.com/model", "bad;command"]) {
      assert.throws(() => parseModel(value));
    }
    const ai = new LocalAI(root, "arm64");
    const env = ai.environment();
    assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
    assert.ok(env.UV_PYTHON_INSTALL_DIR.startsWith(root));
    assert.ok(env.HF_HOME.startsWith(root));
    const state = await ai.status("mlx-community/Qwen2.5-0.5B-Instruct-4bit");
    assert.equal(state.ready, false);
    await assert.rejects(ai.connection(state.model), /Settings/);
    const bytes = Buffer.from("a verified runtime archive");
    const release = { url: "https://fixture/runtime", sha256: createHash("sha256").update(bytes).digest("hex") };
    const target = join(root, "runtime.tgz");
    await downloadVerified(release, target, () => {}, async () => new Response(bytes));
    assert.ok(existsSync(target));
    await assert.rejects(downloadVerified({ ...release, sha256: "bad" }, target, () => {}, async () => new Response(bytes)), /checksum/);
    assert.equal(existsSync(target + ".partial"), false);

    let requests: any[] = [];
    globalThis.fetch = (async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url: String(url), body });
      const content = body.messages[0].role === "user"
        ? '{"translation":"中文"}' : '{"results":[{"text":"Je suis allé à Paris.","note":"Corrigé."}]}';
      if (!body.stream) return Response.json({ choices: [{ message: { content } }] });
      const sse = [
        ': keepalive\n\n',
        ...[content.slice(0, 32), content.slice(32)].map(part => 'data: ' + JSON.stringify({ choices: [{ delta: { content: part } }] }) + '\n\n'),
        'data: [DONE]\n\n',
      ].join('');
      const encoded = new TextEncoder().encode(sse);
      return new Response(new ReadableStream({ start(controller) {
        for (let n = 0; n < encoded.length; n += 7) controller.enqueue(encoded.slice(n, n + 7));
        controller.close();
      }}));
    }) as typeof fetch;
    for (const method of ["refine", "refineStream"]) {
      let streamed = "";
      const result = await ollama[method]({ host: "http://127.0.0.1:1234", provider: "mlx", model: "default_model",
        displayModel: "mlx-community/test", mode: "grammar", language: "fr", text: "je aller Paris", bank: {}, onToken: token => { streamed += token; } });
      assert.equal(result.model, "mlx-community/test");
      assert.equal(result.results[0].text, "Je suis allé à Paris.");
      assert.equal(result.results[0].translation, "中文");
      if (method === "refineStream") assert.ok(streamed.includes("Paris"));
    }
    assert.ok(requests.every(request => request.url.endsWith("/v1/chat/completions")));
    assert.ok(requests.every(request => request.body.model === "default_model"));
    assert.ok(requests.every(request => !('format' in request.body)));
    globalThis.fetch = (async () => Response.json({ models: [{ name: "other-model" }] })) as typeof fetch;
    await assert.rejects(ollama.resolveModel("http://fixture", "selected-model"), /selected model is not installed/);
    console.log("PASS: model routing, Intel compatibility, missing setup, private environment, runtime checksums, MLX SSE and JSON, translation recovery, and strict model selection");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
