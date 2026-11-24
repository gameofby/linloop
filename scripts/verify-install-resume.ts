import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const { downloadVerified, LocalAI } = require('../src/main/local-ai');
async function run() {
const root = fs.mkdtempSync(join(tmpdir(), 'linloop-resume-'));
try {
 const bytes = Buffer.from('runtime archive content');
 const release = { url: 'https://fixture/runtime', sha256: createHash('sha256').update(bytes).digest('hex') };
 const target = join(root, 'runtime.tgz');
 await assert.rejects(downloadVerified(release, target, () => {}, async () => new Response(new ReadableStream({
  start(c) { c.enqueue(bytes.subarray(0, 8)); }, pull(c) { c.error(new Error('connection interrupted')); }
 }))), /interrupted/);
 assert.equal(fs.existsSync(target + '.partial'), true, 'Interrupted setup must retain downloaded bytes for the next attempt');
 assert.equal(fs.statSync(target + '.partial').size, 8);
 await downloadVerified(release, target, () => {}, async (_url, options) => {
  assert.equal(options.headers.Range, 'bytes=8-');
  return new Response(bytes.subarray(8), { status:206, headers:{'content-range':`bytes 8-${bytes.length-1}/${bytes.length}`, 'content-length':String(bytes.length-8)} });
 });
 assert.deepEqual(fs.readFileSync(target), bytes);
 // A server that ignores Range must replace the old prefix.
 fs.writeFileSync(target + '.partial', bytes.subarray(0, 4));
 fs.rmSync(target);
 await downloadVerified(release, target, () => {}, async () => new Response(bytes));
 assert.deepEqual(fs.readFileSync(target), bytes);
 // Executable files from an interrupted extraction must never count as installed.
 fs.mkdirSync(join(root, 'ollama'), {recursive:true});
 fs.writeFileSync(join(root, 'ollama/ollama'), '#!/bin/sh\nexit 0\n', {mode:0o755});
 const ai = new LocalAI(root, {localOnly:true, host:'http://127.0.0.1:21438'});
 assert.equal(ai.ollamaBinary(), undefined);
 ai.models = async () => null;
 ai.installRuntime = async () => { throw new Error('interrupted extraction'); };
 await assert.rejects(ai.setup(), /interrupted extraction/);
 assert.equal((await ai.status()).resumable, true);
 ai.stop();
 const payload = join(root, 'payload'); fs.mkdirSync(payload);
 fs.writeFileSync(join(payload, 'ollama'), '#!/bin/sh\nexit 0\n', {mode:0o755});
 const fixture = join(root, 'fixture.tgz');
 execFileSync('/usr/bin/tar', ['-czf', fixture, '-C', payload, '.']);
 const archive = fs.readFileSync(fixture);
 const repair = new LocalAI(root, {localOnly:true, release:{url:'https://fixture/runtime',sha256:createHash('sha256').update(archive).digest('hex')}});
 repair.models = async () => null;
 const originalFetch = globalThis.fetch;
 let downloads = 0, interrupt = true;
 const run = repair.run.bind(repair);
 repair.run = async (...args) => {
  const result = await run(...args);
  if (args[0] === '/usr/bin/tar' && interrupt) { interrupt = false; throw new Error('extraction interrupted'); }
  return result;
 };
 try {
  globalThis.fetch = (async () => { downloads++; return new Response(archive); }) as typeof fetch;
  await assert.rejects(repair.installRuntime(() => {}), /extraction interrupted/);
  assert.equal(repair.ollamaBinary(), undefined);
  await repair.installRuntime(() => {});
  assert.ok(repair.ollamaBinary());
  assert.equal(downloads, 1, 'Retry after extraction failure must reuse the verified archive');
  assert.equal(fs.existsSync(join(root, 'ollama.installing')), false);
 } finally { globalThis.fetch = originalFetch; repair.stop(); }
 const legacyRoot = join(root, 'legacy');
 fs.mkdirSync(join(legacyRoot, 'ollama'), {recursive:true});
 fs.writeFileSync(join(legacyRoot, 'ollama/ollama'), `#!${process.execPath}\nconst http=require('node:http'); const port=new URL(process.env.OLLAMA_HOST).port; http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'qwen2.5:0.5b'}]}));}).listen(port,'127.0.0.1');`, {mode:0o755});
 const legacy = new LocalAI(legacyRoot, {localOnly:true,host:'http://127.0.0.1:21438'});
 try {
  const state = await legacy.status();
  assert.ok(state.ready);
  assert.ok(fs.existsSync(join(legacyRoot, 'ollama/.complete')), 'A healthy legacy runtime must gain a completion marker without a download');
  await legacy.setup();
 } finally { legacy.stop(); }
 console.log('PASS: interrupted runtime download resumes from saved bytes and verifies the complete archive');
} finally { fs.rmSync(root, {recursive:true,force:true}); }

}
run().catch(error => { console.error(error); process.exitCode = 1; });
