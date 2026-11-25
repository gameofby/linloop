import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
const { LocalAI, DEFAULT_MODEL } = require('../src/main/local-ai');
const client = require('../src/main/ollama');
const ai = new LocalAI(join(homedir(), 'Library/Application Support/linloop/local-ai'));
const text = "Currently, we don’t have user_id exposed in the pod. What’s it for?";
async function run() {
try {
  const connection = await ai.connection(DEFAULT_MODEL);
  for (const method of ['refine', 'refineStream']) {
    const result = await client[method]({ ...connection, mode: 'refine', text, language: 'en', bank: {} });
    const output = result.results[0].text;
    console.log(method, output);
    assert.match(output, /\?/, 'Refine must preserve the question');
    assert.match(output, /currently|at present|right now|at the moment/i, 'Refine must preserve the time qualifier');
    assert.match(output, /user_id/, 'Refine must preserve the identifier');
    assert.match(output, /pod/i);
  }
} finally { ai.stop(); }

}
run().catch(error => { console.error(error); process.exitCode = 1; });
