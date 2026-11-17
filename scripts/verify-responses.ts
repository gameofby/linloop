import assert from "node:assert/strict";
const ollama = require("../src/main/ollama");

async function run() {
  const originalFetch = globalThis.fetch;
  let content = '';
  let body;
  let translationPrompt;
  let translationFails = false;
  let translationRequests = 0;
  globalThis.fetch = (async (url, options) => {
    if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: 'test' }] });
    const requestBody = JSON.parse(options.body);
    if (requestBody.format.properties.translation) {
      translationRequests++;
      translationPrompt = requestBody.messages[0].content;
      if (translationFails) return new Response('unavailable', { status: 503 });
      return Response.json({ message: { content: '{"translation":"我现在需要决定。"}' } });
    }
    body = requestBody;
    if (!body.stream) return Response.json({ message: { content } });
    const lines = [
      { message: { content: content.slice(0, 25) }, done: false },
      { message: { content: content.slice(25) }, done: false },
      { done: true, done_reason: 'length' },
    ].map(event => JSON.stringify(event)).join('\n');
    return new Response(lines);
  }) as typeof fetch;
  const request = { host: 'http://fixture', model: 'test', mode: 'refine', text: 'I need decide now', bank: {} };
  try {
    content = '{"results":[{"text":"I need to decide now.","translation":"我现在需要决定。","note":"Clear."}],"learnings":{"words":[';
    for (const method of ['refine', 'refineStream']) {
      const data = await ollama[method](request);
      assert.equal(data.results[0].text, 'I need to decide now.', 'A complete result must survive a truncated learning section');
    }
    content = '{"results":[{"text":"I need to decide now.","translation":"unfinished';
    assert.equal((await ollama.refineStream(request)).results[0].text, 'I need to decide now.',
      'Complete English text must survive an unfinished translation or note');
    assert.equal((await ollama.refineStream(request)).results[0].translation, '我现在需要决定。',
      'An unfinished translation must be recovered with a separate translation request');
    assert.ok(translationRequests > 0);
    translationFails = true;
    const failedTranslation = (await ollama.refineStream(request)).results[0];
    assert.equal(failedTranslation.text, 'I need to decide now.');
    assert.match(failedTranslation.translationError, /Translation unavailable/,
      'A translation error must be visible while preserving the English result');
    translationFails = false;
    content = JSON.stringify({ results: [{ text: 'First.' }, { text: 'Second.' }, { text: 'Third.' }], learnings: {} });
    for (const method of ['refine', 'refineStream']) {
      assert.equal((await ollama[method](request)).results.length, 1, 'Refine must return one candidate');
      assert.equal(body.format.properties.results.maxItems, 1, 'The request must constrain the candidate count');
      assert.doesNotMatch(body.messages[1].content, /3 distinct/);
    }
    for (content of ['{"results":[{"text":"unfinished', '{"results":[]}', '{"results":[null]}']) {
      await assert.rejects(ollama.refineStream(request), /Could not finish/, 'Incomplete text must not become a successful result');
    }
    content = JSON.stringify({ results: [{ text: 'Say "hello" and use {braces}.', translation: '你好' }], learnings: {} }).slice(0, -2);
    assert.equal((await ollama.refineStream(request)).results[0].text, 'Say "hello" and use {braces}.');
    content = '{"results":[{"text":"Je suis allé à Paris.","translation":"unfinished';
    for (const method of ['refine', 'refineStream']) {
      for (const mode of ['grammar', 'refine']) {
        const data = await ollama[method]({ ...request, mode, language: 'fr', text: 'je aller Paris' });
        assert.equal(data.results[0].text, 'Je suis allé à Paris.');
        assert.match(body.messages[0].content, /French writing helper/);
        assert.match(body.messages[1].content, /Target language: French/);
        assert.match(translationPrompt, /Translate this French text into Simplified Chinese/);
      }
    }
    console.log('PASS: truncated JSON recovery, one candidate, schema, escaped strings, and incomplete-result errors');
  } finally { globalThis.fetch = originalFetch; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
