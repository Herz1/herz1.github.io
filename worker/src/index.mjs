// Anonymous, read-only proxy. No caller headers, cookies, URLs or credentials reach upstream.
const UPSTREAM = 'https://api.bilibili.com/x/space/bangumi/follow/list';
const ROUTE = '/api/bilibili/follows';
const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

class ApiError extends Error {
  constructor(message, status = 502, code = -502, transient = true) {
    super(message);
    Object.assign(this, { status, code, transient });
  }
}

function parameters(search) {
  const allowed = new Set(['uid', 'page', 'page_size', 'follow_status']);
  for (const key of search.keys()) {
    if (!allowed.has(key) || search.getAll(key).length !== 1) {
      throw new ApiError('不支持的查询参数。', 400, -400, false);
    }
  }
  // UID stays a string: large Bilibili IDs must not lose precision.
  const uid = (search.get('uid') || '').replace(/^0+/, '');
  if (!/^[1-9]\d{0,19}$/.test(uid)) throw new ApiError('请输入有效的公开 UID。', 400, -400, false);
  const integer = (key, fallback, min, max) => {
    const value = search.get(key) ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
      throw new ApiError('分页或状态参数无效。', 400, -400, false);
    }
    return Number(value);
  };
  return { uid, page: integer('page', 1, 1, 10000), size: integer('page_size', 24, 1, 30), status: integer('follow_status', 0, 0, 3) };
}

async function readJson(response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError('Bilibili 返回了非 JSON 响应，请稍后重试。');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('Bilibili 返回了空响应。');
  const decoder = new TextDecoder();
  let length = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw new ApiError('Bilibili 返回的数据过大。');
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    if (error instanceof ApiError || error.name === 'AbortError') throw error;
    throw new ApiError('Bilibili 返回了无法识别的数据。');
  } finally {
    reader.releaseLock();
  }
}

async function upstream(params, fetcher, timeoutMs) {
  const url = new URL(UPSTREAM);
  url.search = new URLSearchParams({ vmid: params.uid, type: '1', pn: params.page, ps: params.size, follow_status: params.status });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', Referer: `https://space.bilibili.com/${params.uid}/bangumi`, 'User-Agent': 'Mozilla/5.0 UsagiyamaPublicBangumi/1.0' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([403, 412, 429].includes(response.status)) {
        throw new ApiError('Bilibili 暂时限制公开接口访问，请稍后重试。', 503, -503);
      }
      throw new ApiError(`Bilibili 服务暂不可用（HTTP ${response.status}）。`);
    }
    const payload = await readJson(response);
    if (payload?.code !== 0) {
      const code = Number(payload?.code);
      if (code === 53013) throw new ApiError('该账号的追番列表未公开，请在 Bilibili 隐私设置中开放追番。', 403, code, false);
      if ([-352, -412, -509, 429].includes(code)) {
        throw new ApiError('Bilibili 暂时限制公开接口访问，请稍后重试。', 503, code);
      }
      // Do not serve a cached list if upstream explicitly denies public access.
      throw new ApiError('无法读取该账号的公开追番，请确认 UID 和公开设置。', 403, Number.isFinite(code) ? code : -403, false);
    }
    const data = payload.data;
    if (!data || !(Array.isArray(data.list) || (data.list == null && data.total === 0)) || !Number.isSafeInteger(data.total) || data.total < 0) {
      throw new ApiError('Bilibili 返回的数据格式发生变化。');
    }
    const list = data.list || [];
    if (list.length > params.size || list.some(item => !item || typeof item !== 'object' || Array.isArray(item) || !item.season_id)) {
      throw new ApiError('Bilibili 返回的番剧列表格式无效。');
    }
    return { list, total: data.total, pn: params.page, ps: params.size };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('连接 Bilibili 超时，请稍后重试。', 504, -504);
    throw new ApiError('暂时无法连接 Bilibili，请稍后重试。');
  } finally {
    clearTimeout(timer);
  }
}

export function createHandler({ fetcher = fetch, cache, now = Date.now, timeoutMs = 10000 } = {}) {
  const pending = new Map();
  const getCache = () => cache ?? globalThis.caches?.default;
  const read = async (key) => {
    try { return await (await getCache()?.match(key))?.json(); } catch { return undefined; }
  };
  const put = async (key, value, seconds) => {
    try {
      await getCache()?.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${seconds}` } }));
    } catch { /* Cache failure must not hide a successful public response. */ }
  };

  return async function handle(request, env = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const origins = String(env.ALLOWED_ORIGINS || 'https://herz1.github.io').split(',').map(v => v.trim()).filter(Boolean);
    const allowed = !origin || origins.includes(origin);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
      ...(origin && allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const reply = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
    if (!allowed) return reply({ code: -403, message: '该来源未获允许。' }, 403);
    if (![ROUTE, '/healthz'].includes(url.pathname)) return reply({ code: -404, message: '接口不存在。' }, 404);
    if (request.method === 'OPTIONS') {
      const method = request.headers.get('Access-Control-Request-Method');
      const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
      if ((method && method !== 'GET') || requestedHeaders.some(v => v !== 'accept')) return reply({ code: -403, message: '仅允许匿名 GET 请求。' }, 403);
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', 'Access-Control-Max-Age': '86400' } });
    }
    if (request.method !== 'GET') return reply({ code: -405, message: '仅支持 GET。' }, 405, { Allow: 'GET, OPTIONS' });
    if (url.pathname === '/healthz') return reply({ code: 0, service: 'usagiyama-bangumi-api', version: 1 });

    try {
      const params = parameters(url.searchParams);
      const key = new URL('/_cache/v1/follows', url.origin);
      key.search = new URLSearchParams({ uid: params.uid, page: params.page, page_size: params.size, follow_status: params.status });
      const cacheKey = key.href;
      const cooldownKey = `${url.origin}/_cache/v1/cooldown/${params.uid}`;
      const cached = await read(cacheKey);
      const cooldown = await read(cooldownKey);
      const age = cached ? now() - cached.savedAt : Infinity;
      const success = (entry, mode, warning) => reply({
        code: 0, message: 'success', data: entry.data,
        meta: { source: 'bilibili-public', cache: mode, stale: mode === 'STALE', fetchedAt: new Date(entry.savedAt).toISOString(), ...(warning ? { warning } : {}) },
      });
      if (cooldown && now() < cooldown.until && !cooldown.transient) {
        throw new ApiError(cooldown.message, cooldown.status, cooldown.code, false);
      }
      if (age >= 0 && age < FRESH_MS) return success(cached, 'HIT');
      try {
        if (cooldown && now() < cooldown.until) throw new ApiError(cooldown.message, cooldown.status, cooldown.code, cooldown.transient);
        if (!pending.has(cacheKey)) {
          const job = (async () => {
            for (const [binding, limitKey] of [[env.UID_LIMITER, params.uid], [env.UPSTREAM_LIMITER, 'bilibili']]) {
              if (binding && !(await binding.limit({ key: limitKey })).success) throw new ApiError('请求较频繁，请一分钟后重试。', 429, -429);
            }
            const data = await upstream(params, fetcher, timeoutMs);
            const entry = { data, savedAt: now() };
            await put(cacheKey, entry, STALE_MS / 1000);
            return entry;
          })();
          pending.set(cacheKey, job);
          // Both branches clean up without creating an unhandled rejection.
          job.then(() => pending.delete(cacheKey), () => pending.delete(cacheKey));
        }
        return success(await pending.get(cacheKey), 'MISS');
      } catch (error) {
        const failure = error instanceof ApiError ? error : new ApiError('追番服务暂不可用，请稍后重试。');
        await put(cooldownKey, { until: now() + 60000, message: failure.message, status: failure.status, code: failure.code, transient: failure.transient }, 60);
        if (failure.transient && age >= 0 && age < STALE_MS) return success(cached, 'STALE', failure.message);
        if (!failure.transient) {
          try { await getCache()?.delete(cacheKey); } catch { /* Best effort eviction. */ }
        }
        throw failure;
      }
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError('追番服务暂不可用，请稍后重试。');
      return reply({ code: failure.code, message: failure.message }, failure.status, failure.transient ? { 'Retry-After': '60' } : {});
    }
  };
}

export default { fetch: createHandler() };
