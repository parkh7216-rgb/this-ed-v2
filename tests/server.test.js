'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, validateOutput, parseModelText, parseImageDataUrl, MODEL } = require('../server');

const passage = '도시의 열섬 현상은 건물과 도로가 낮에 흡수한 열을 밤에도 천천히 방출하면서 도심의 기온이 주변 지역보다 높게 유지되는 현상이다. 가로수를 늘리면 그늘이 생기고 잎에서 물이 증발하는 과정에서 주변 공기의 열이 쓰이므로 온도를 낮출 수 있다. 그러나 물이 부족한 지역에서는 나무를 유지하는 데 필요한 관개가 다른 용도의 물 사용을 압박할 수 있다. 지붕을 밝은 색으로 바꾸면 햇빛을 더 많이 반사하여 건물이 흡수하는 열이 줄어든다. 다만 밝은 지붕의 효과는 일사량이 많은 낮에 두드러지며 그늘이나 증발 효과를 직접 만들어 내지는 않는다. 따라서 도시의 여건을 고려하지 않고 어느 한 대책이 모든 곳에서 가장 우수하다고 단정해서는 안 된다.';
const testPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const testJpeg = `data:image/jpeg;base64,${require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/valid-2x2.jpg')).toString('base64')}`;
function fixture() {
  return { questions: Array.from({ length: 5 }, (_, i) => ({
    q: `지문 추론 문제 ${i + 1}은 어떤 내용을 뒷받침하는가?`,
    o: ['낮의 반사 효과', '밤의 열 방출', '관개 수요 부담', '그늘 형성', '모든 도시에서 단일 해법'],
    a: i % 5, quote: '도시의 열섬 현상은 건물과 도로가 낮에 흡수한 열을 밤에도 천천히 방출하면서',
    e: `이 선택지는 지문 ${i + 1}의 직접 근거와 세부 조건을 따른다. 다른 선택지는 지문의 범위를 벗어나거나 서로 다른 대책의 효과를 혼동하므로 옳지 않다.`,
  })) };
}
async function withServer(options, run) {
  const server = createServer({ rateMax: 50, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (base, value, headers = {}) => fetch(base + '/api/generate', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value),
});

test('health, static allowlist, private paths and HTTP methods', async () => withServer({}, async base => {
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-frame-options'), null);
  for (const file of ['/style.css', '/app.js', '/question-data.js', '/extra-questions.js', '/scan-passage-questions.js', '/manus-routes.json'])
    assert.equal((await fetch(base + file)).status, 200, file);
  for (const url of ['/.git/config', '/server.js', '/Dockerfile', '/tests/server.test.js', '/TODO.md', '/package.json', '/api/not-real'])
    assert.equal((await fetch(base + url)).status, 404, url);
  assert.equal((await fetch(base + '/api/health', { method: 'POST' })).status, 405);
  const wrongMethod = await fetch(base + '/api/generate');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  assert.match((await wrongMethod.json()).error, /POST 요청/);
  assert.equal((await fetch(base + '/anything')).status, 404);
}));

test('request input validation and JSON response errors are localized', async () => withServer({}, async base => {
  const oldUrl = process.env.MANUS_API_URL, oldKey = process.env.MANUS_API_KEY;
  delete process.env.MANUS_API_URL; delete process.env.MANUS_API_KEY;
  try {
  let r = await post(base, { title: '', passage: '짧은 지문입니다.' });
  assert.equal(r.status, 400); assert.ok((await r.json()).error.includes('40~6000자'));
  r = await post(base, { title: '사진 지문', passage: '', image: testPng });
  assert.equal(r.status, 503); // Valid image input reaches the configured AI service check.
  r = await post(base, { title: '사진 지문', passage: '', image: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==' });
  assert.equal(r.status, 400);
  r = await post(base, { title: '사진 지문', passage: '', image: 'data:image/jpeg;base64,/9j/' });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /읽을 수 없어요/);
  r = await post(base, { title: '사진 지문', passage, image: testPng });
  assert.equal(r.status, 400); // Text and image modes are mutually exclusive.
  r = await post(base, { title: '', passage: passage + '<script>alert(1)</script>' });
  assert.equal(r.status, 503); // No credentials means no upstream call.
  assert.ok((await r.json()).error);
  r = await fetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
  assert.equal(r.status, 415);
  r = await fetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(r.status, 400);
  r = await post(base, { title: 't', passage: '가'.repeat(6001) });
  assert.equal(r.status, 400);
  } finally {
    if (oldUrl === undefined) delete process.env.MANUS_API_URL; else process.env.MANUS_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.MANUS_API_KEY; else process.env.MANUS_API_KEY = oldKey;
  }
}));

test('output structure and quoted passage evidence are strictly verified and returned as text data', () => {
  const raw = fixture(); raw.questions[0].q = '<img src=x onerror=alert(1)>';
  const out = validateOutput(raw, passage);
  assert.equal(out.length, 5); assert.equal(out[0].q, '<img src=x onerror=alert(1)>'); assert.match(out[0].e, /근거\(원문\)/);
  const bad = fixture(); bad.questions[0].quote = '이 문구는 지문에 없음';
  assert.throws(() => validateOutput(bad, passage));
  assert.throws(() => validateOutput({ questions: fixture().questions.slice(0, 4) }, passage));
  assert.throws(() => validateOutput({ questions: [] }, passage));
  assert.equal(parseModelText('```json\n{"questions":[]}\n```').questions.length, 0);
  assert.equal(MODEL, 'gpt-6.1-sol');
});

test('image data URLs validate container structure, dimensions, format, and byte limits', () => {
  assert.equal(parseImageDataUrl(testPng).mime, 'image/png');
  assert.equal(parseImageDataUrl(testJpeg).mime, 'image/jpeg');
  assert.throws(() => parseImageDataUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA=='));
  assert.throws(() => parseImageDataUrl('data:image/png;base64,AA=='));
  assert.throws(() => parseImageDataUrl('data:image/jpeg;base64,/9j/'));
  const pngBytes=Buffer.from(testPng.split(',')[1],'base64');
  assert.throws(() => parseImageDataUrl(`data:image/png;base64,${pngBytes.subarray(0,pngBytes.length-12).toString('base64')}`));
  const oversized = `data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')}`;
  assert.throws(() => parseImageDataUrl(oversized), /image_size/);
});

test('actual chat-completions contract, credentials and one retry without JSON schema', async () => {
  const originalFetch = global.fetch, oldUrl = process.env.MANUS_API_URL, oldKey = process.env.MANUS_API_KEY;
  process.env.MANUS_API_URL = 'https://platform.example'; process.env.MANUS_API_KEY = 'test-secret';
  assert.equal(validateOutput(fixture(), passage).length, 5);
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    if (calls.length === 1) return new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fixture()) } }] }), { status: 200 });
  };
  try {
    await withServer({}, async base => {
      const response = await originalFetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '도시 열섬', passage }) });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.questions.length, 5);
      assert.equal(result.questions[0].o.length, 5);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, 'https://platform.example/v1/chat/completions');
      assert.equal(calls[0].init.headers.Authorization, 'Bearer test-secret');
      assert.equal(calls[0].body.model, MODEL);
      assert.ok(calls[0].body.response_format);
      assert.equal(calls[1].body.response_format, undefined);
      assert.match(calls[0].body.messages[0].content, /신뢰할 수 없는/);
      assert.match(calls[0].body.messages[0].content, /수능·모의고사형/);
      assert.match(calls[0].body.messages[0].content, /맞춤법·띄어쓰기·문법 오류/);
      assert.match(calls[0].body.messages[0].content, /선택지별로 구체적으로/);
    });
  } finally {
    global.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.MANUS_API_URL; else process.env.MANUS_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.MANUS_API_KEY; else process.env.MANUS_API_KEY = oldKey;
  }
});

test('image generation sends a validated vision data URL and returns the recognized passage', async () => {
  const originalFetch = global.fetch, oldUrl = process.env.MANUS_API_URL, oldKey = process.env.MANUS_API_KEY;
  process.env.MANUS_API_URL = 'https://platform.example'; process.env.MANUS_API_KEY = 'test-secret';
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    const output = { passage, questions: fixture().questions };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
  };
  try {
    await withServer({}, async base => {
      const response = await originalFetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '도시 열섬 사진', passage: '', image: testPng }) });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.passage, passage);
      assert.equal(result.questions.length, 5);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://platform.example/v1/chat/completions');
      const imageContent = calls[0].body.messages[1].content;
      assert.equal(imageContent[1].type, 'image_url');
      assert.equal(imageContent[1].image_url.url, testPng);
      assert.equal(imageContent[1].image_url.detail, 'high');
      assert.equal(calls[0].body.response_format.json_schema.schema.properties.passage.type, 'string');
    });
  } finally {
    global.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.MANUS_API_URL; else process.env.MANUS_API_URL = oldUrl;
    if (oldKey === undefined) delete process.env.MANUS_API_KEY; else process.env.MANUS_API_KEY = oldKey;
  }
});

test('payload size limit and basic per-IP throttling', async () => {
  await withServer({ rateMax: 1 }, async base => {
    const tooLarge = ' '.repeat(6 * 1024 * 1024 + 20);
    const largeResponse = await fetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: tooLarge });
    assert.equal(largeResponse.status, 413);
    assert.ok((await largeResponse.json()).error);
    await fetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    const rateLimited = await fetch(base + '/api/generate', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    assert.equal(rateLimited.status, 429);
    assert.ok(rateLimited.headers.get('retry-after'));
  });
});
