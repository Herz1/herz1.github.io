import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/index.mjs';

const origin = 'https://herz1.github.io';
const endpoint = 'https://example.workers.dev/api/bilibili/follows';
const params = '?uid=201622770&page=1&page_size=24&follow_status=0';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const sample = () => ({ code: 0, data: { list: [{ season_id: 1, title: '测试番剧', follow_status: 2, progress: '看到第3话', total_count: 12, cover: 'https://i0.hdslb.com/test.jpg' }], total: 1 } });
function harness(options = {}) {
  let time = Date.parse('2026-10-27T00:00:00Z');
  let fetcher = options.fetcher || (async () => json(sample()));
  const calls = [];
  const entries = new Map();
  const cache = {
    async match(key) { const entry = entries.get(String(key)); return entry && entry.expires > time ? entry.response.clone() : undefined; },
    async put(key, response) { entries.set(String(key), { response: response.clone(), expires: time + Number(response.headers.get('cache-control').match(/max-age=(\d+)/)[1]) * 1000 }); },
    async delete(key) { return entries.delete(String(key)); },
  };
  const handler = createHandler({ cache, now: () => time, timeoutMs: options.timeoutMs || 100, fetcher: async (...args) => { calls.push(args); return fetcher(...args); } });
  return {
    calls, entries, cache, handler,
    advance(ms) { time += ms; },
    use(fn) { fetcher = fn; },
    request(query = params, init = {}, env = {}) { return handler(new Request(endpoint + query, { ...init, headers: { Origin: origin, ...init.headers } }), env); },
  };
}

test('anonymous proxy preserves status, progress, pagination and large UID precision', async () => {
  const h = harness();
  const response = await h.request('?uid=12345678901234567890&page=2&page_size=30&follow_status=3', { headers: { Cookie: 'never-forward', Authorization: 'never-forward' } });
  const body = await response.json();
  assert.equal(body.code, 0);
  assert.equal(body.data.pn, 2);
  assert.equal(body.data.ps, 30);
  assert.equal(body.data.list[0].progress, '看到第3话');
  const [url, init] = h.calls[0];
  assert.equal(url.hostname, 'api.bilibili.com');
  assert.equal(url.searchParams.get('vmid'), '12345678901234567890');
  assert.equal(url.searchParams.get('follow_status'), '3');
  assert.equal(init.headers.Cookie, undefined);
  assert.equal(init.headers.Authorization, undefined);
  assert.equal(init.redirect, 'error');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('invalid queries never contact upstream', async () => {
  const h = harness();
  for (const query of ['?uid=0', '?uid=-1', '?uid=1e9', '?uid=123456789012345678901', '?uid=1&page=0', '?uid=1&page_size=31', '?uid=1&follow_status=4', '?uid=1&uid=2', '?uid=1&url=https://example.com']) {
    assert.equal((await h.request(query)).status, 400, query);
  }
  assert.equal(h.calls.length, 0);
});

test('CORS rejects foreign origins and handles preflight on success and error', async () => {
  const h = harness();
  const denied = await h.request(params, { headers: { Origin: 'https://attacker.test' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const ok = await h.request(params, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'accept' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), origin);
  assert.equal((await h.request(params, { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'authorization' } })).status, 403);
  const invalid = await h.request('?uid=0');
  assert.equal(invalid.headers.get('access-control-allow-origin'), origin);
  assert.equal(h.calls.length, 0);
});

test('unknown routes and methods are not proxies; health does not contact upstream', async () => {
  const h = harness();
  assert.equal((await h.handler(new Request('https://example.workers.dev/healthz'))).status, 200);
  assert.equal((await h.handler(new Request('https://example.workers.dev/anything'))).status, 404);
  assert.equal((await h.request(params, { method: 'POST' })).status, 405);
  assert.equal(h.calls.length, 0);
});

test('cache keys canonicalize queries, separate account/filter/page and keep CORS per request', async () => {
  const h = harness();
  assert.equal((await (await h.request()).json()).meta.cache, 'MISS');
  const cached = await h.request('?follow_status=0&page_size=24&page=1&uid=0201622770', { headers: { Origin: 'https://preview.test' } }, { ALLOWED_ORIGINS: origin + ',https://preview.test' });
  assert.equal((await cached.json()).meta.cache, 'HIT');
  assert.equal(cached.headers.get('access-control-allow-origin'), 'https://preview.test');
  assert.equal(h.calls.length, 1);
  await h.request('?uid=201622770&follow_status=1');
  await h.request('?uid=201622770&page=2');
  await h.request('?uid=2');
  assert.equal(h.calls.length, 4);
});

test('transient failures return dated stale data and cooldown avoids repeated upstream requests', async () => {
  const h = harness();
  const first = await (await h.request()).json();
  h.advance(301000);
  h.use(async () => json({ code: -412 }));
  const stale = await (await h.request()).json();
  assert.equal(stale.meta.stale, true);
  assert.equal(stale.meta.fetchedAt, first.meta.fetchedAt);
  await h.request();
  assert.equal(h.calls.length, 2);
  h.advance(30000);
  await h.request();
  assert.equal(h.calls.length, 2);
  h.advance(31000);
  h.use(async () => json(sample()));
  assert.equal((await (await h.request()).json()).meta.cache, 'MISS');
  assert.equal(h.calls.length, 3, 'traffic during cooldown must not postpone recovery');
  h.advance(24 * 3600000);
  h.use(async () => json({ code: -412 }));
  assert.equal((await h.request()).status, 503);
});

test('privacy denial is explicit, evicts stale list, and is not reported as empty success', async () => {
  const h = harness();
  await h.request();
  h.advance(301000);
  h.use(async () => json({ code: 53013, message: '用户隐私设置未公开' }));
  const response = await h.request();
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, 53013);
  assert.match(body.message, /未公开/);
  assert.equal(body.data, undefined);
  assert.equal([...h.entries.keys()].filter(key => key.includes('/follows?')).length, 0);
});

test('empty public lists are a valid cached result', async () => {
  const h = harness({ fetcher: async () => json({ code: 0, data: { list: null, total: 0 } }) });
  assert.deepEqual((await (await h.request()).json()).data.list, []);
  assert.equal((await (await h.request()).json()).meta.cache, 'HIT');
});

test('HTML, malformed JSON, wrong shape and oversized responses fail safely', async () => {
  for (const fn of [
    async () => new Response('<html>rate limited</html>'),
    async () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    async () => json({ code: 0, data: { list: 'bad', total: 1 } }),
    async () => json({ code: 0, data: { list: [null], total: 1 } }),
    async () => json({ code: 0, data: { list: [], total: -1 } }),
    async () => json({ padding: 'x'.repeat(2 * 1024 * 1024) }),
  ]) {
    const h = harness({ fetcher: fn });
    assert.equal((await h.request()).status, 502);
  }
});

test('upstream HTTP limit and timeout have bounded errors and retry advice', async () => {
  for (const status of [403, 412, 429]) {
    const h = harness({ fetcher: async () => new Response('', { status }) });
    const r = await h.request();
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('retry-after'), '60');
  }
  const h = harness({ timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
  assert.equal((await h.request()).status, 504);
});

test('simultaneous identical misses share one upstream request', async () => {
  const h = harness({ fetcher: async () => { await new Promise(resolve => setTimeout(resolve, 10)); return json(sample()); } });
  const responses = await Promise.all([h.request(), h.request(), h.request()]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(h.calls.length, 1);
});

test('rate limit applies to upstream misses, while fresh cache still loads', async () => {
  const h = harness();
  const env = { UID_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await h.request(params, {}, env)).status, 429);
  assert.equal(h.calls.length, 0);
  h.advance(61000);
  await h.request();
  assert.equal((await h.request(params, {}, env)).status, 200);
  assert.equal(h.calls.length, 1);
});

test('cache backend failure does not break successful data', async () => {
  const handler = createHandler({ fetcher: async () => json(sample()), cache: { match() { throw Error('cache down'); }, put() { throw Error('cache down'); } } });
  assert.equal((await handler(new Request(endpoint + params))).status, 200);
});
