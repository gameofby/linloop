// Opt-in network test. Uses an isolated directory, port, runtime, and model cache.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { LocalAI, DEFAULT_MODEL } = require('../src/main/local-ai');
async function run() {
 const root = process.env.LINLOOP_INSTALL_TEST_ROOT || fs.mkdtempSync(join(tmpdir(), 'linloop-clean-install-'));
 console.log('Isolated install directory:', root);
 const original = globalThis.fetch;
 const chunkMiB = Number(process.env.LINLOOP_INSTALL_TEST_CHUNK_MIB || 0);
 let stage = 'runtime', interruptedRuntime = false, interruptedModel = false;
 let ai = new LocalAI(root, {localOnly:true, host:'http://127.0.0.1:21437'});
 globalThis.fetch = (async (url, options) => {
  const response = await original(url, options);
  const runtime = String(url).includes('/releases/');
  const model = String(url).endsWith('/api/pull');
  if ((!runtime && !model) || (runtime && stage !== 'runtime') || (model && stage !== 'model' && !(stage === 'complete' && chunkMiB > 0)) || !response.body) return response;
  let received = 0, firstCompleted = -1;
  const reader = response.body.getReader();
  const body = new ReadableStream({async pull(c) {
   const next = await reader.read();
   if (next.done) { c.close(); return; }
   received += next.value.length;
   const text = model ? new TextDecoder().decode(next.value) : '';
   const completed = Math.max(-1, ...[...text.matchAll(/"completed":\s*(\d+)/g)].map(m => Number(m[1])));
   if (firstCompleted < 0 && completed >= 0) firstCompleted = completed;
   if (model && stage === 'complete' && completed - firstCompleted >= chunkMiB * 1048576) {
    await reader.cancel(); c.error(new Error('Intentional chunk interruption')); return;
   }
   if ((runtime && received > 1048576) || (model && stage === 'model' && /"completed":\s*[1-9]\d{7,}/.test(text))) {
    if (runtime) interruptedRuntime = true; else interruptedModel = true;
    await reader.cancel(); c.error(new Error('Intentional installation interruption')); return;
   }
   c.enqueue(next.value);
  }, cancel() { return reader.cancel(); }});
  return new Response(body, {status:response.status, headers:response.headers});
 }) as typeof fetch;
 let last = '';
 const progress = message => { if (message !== last) console.log(new Date().toISOString(), message); last = message; };
 try {
  if (!fs.existsSync(join(root,'ollama/.complete')) && !fs.existsSync(join(root,'ollama.tgz.partial')) && !fs.existsSync(join(root,'ollama.tgz'))) {
   await assert.rejects(ai.setup(DEFAULT_MODEL, progress), /Intentional/);
   assert.ok(interruptedRuntime);
   assert.ok(fs.statSync(join(root,'ollama.tgz.partial')).size > 0);
   console.log('PASS: runtime interruption retains partial archive');
  }
  stage = 'model';
  await assert.rejects(ai.setup(DEFAULT_MODEL, progress), /Intentional/);
  assert.ok(interruptedModel);
  console.log('PASS: runtime resumed and installed; model interrupted');
  ai.stop();
  await new Promise(resolve => setTimeout(resolve, 1500));
  ai = new LocalAI(root, {localOnly:true, host:'http://127.0.0.1:21437'});
  assert.equal((await ai.status()).resumable, true, 'Settings status must remain available after interrupted setup');
  stage = 'complete';
  for (let attempt = 0; ; attempt++) {
   try { await ai.setup(DEFAULT_MODEL, progress); break; }
   catch (error) {
    if (!String(error.message).includes('Intentional chunk interruption') || attempt >= 99) throw error;
    console.log('PASS: repeated model interruption; continue from retained progress');
    await new Promise(resolve => setTimeout(resolve, 1000));
    ai.stop();
    await new Promise(resolve => setTimeout(resolve, 500));
    ai = new LocalAI(root, {localOnly:true, host:'http://127.0.0.1:21437'});
   }
  }
  const state = await ai.status();
  assert.ok(state.ready && state.defaultReady);
  assert.equal(state.resumable, false);
  const result = await original('http://127.0.0.1:21437/api/generate', {method:'POST', body:JSON.stringify({model:DEFAULT_MODEL,prompt:'Reply with OK.',stream:false})});
  assert.ok((await result.json()).response);
  globalThis.fetch = (async (url, options) => {
   assert.ok(!String(url).endsWith('/api/pull') && !String(url).includes('/releases/'), 'Repeat setup must make no downloads');
   return original(url, options);
  }) as typeof fetch;
  await ai.setup(DEFAULT_MODEL, progress);
  console.log('PASS: fresh installation, runtime resume, model resume after process restart, inference, and zero downloads on repeat setup');
 } finally { ai.stop(); globalThis.fetch = original; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
