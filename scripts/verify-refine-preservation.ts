import assert from 'node:assert/strict';
const client = require('../src/main/ollama');
const originalFetch = globalThis.fetch;
const text = "Currently, we don’t have user_id exposed in the pod. What’s it for?";
const complete = "Currently, user_id isn't exposed in the pod. What is it used for?";
let attempts = 0;
let repair = true;
globalThis.fetch = (async (url, options) => {
  if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'test' }] });
  const body = JSON.parse(options.body);
  if (body.format.properties.translation) return Response.json({ message: { content: '{"translation":"目前，pod 中没有暴露 user_id。它有什么用途？"}' } });
  attempts++;
  const output = repair && attempts > 1 ? complete : 'User ID is not exposed in the pod.';
  const content = JSON.stringify({ results: [{ text: output }] });
  return body.stream ? new Response(JSON.stringify({ message: { content }, done: true }) + '\n') : Response.json({ message: { content } });
}) as typeof fetch;
async function run() {
try {
  for (const method of ['refine', 'refineStream']) {
    attempts = 0; repair = true;
    const result = await client[method]({ host: 'http://fixture', model: 'test', mode: 'refine', text, bank: {} });
    assert.equal(attempts, 2, 'An incomplete rewrite must be retried');
    assert.equal(result.results[0].text, complete);
    attempts = 0; repair = false;
    await assert.rejects(client[method]({ host: 'http://fixture', model: 'test', mode: 'refine', text, bank: {} }), /preserve the complete input/);
    assert.equal(attempts, 2, 'Retries must be bounded');
  }
  console.log('PASS: both request paths retry incomplete rewrites and reject repeated information loss');
} finally { globalThis.fetch = originalFetch; }

}
run().catch(error => { console.error(error); process.exitCode = 1; });
