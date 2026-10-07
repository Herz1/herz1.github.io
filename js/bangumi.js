/* ============================================================
   兔山手帖 · Bilibili 公开追番同步
   仅使用公开 UID，经可配置 API 或本地代理读取，不接触 Cookie 或登录凭据。
   ============================================================ */

(async () => {
  'use strict';

  const UID_KEY = 'usagiyama-bilibili-uid';
  const CACHE_PREFIX = 'usagiyama-bilibili-cache-v2';
  const PAGE_SIZE = 24;
  const STALE_MS = 30 * 60 * 1000;
  const MAX_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
  const REQUEST_MS = 15000;
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 仍可在本页使用 */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* 禁用存储 */ } },
  };

  const grid = document.getElementById('bangumi-grid');
  if (!grid) return;

  const setup = document.getElementById('bili-setup');
  const uidInput = document.getElementById('bili-uid');
  const refreshButton = document.getElementById('bili-refresh');
  const settingsButton = document.getElementById('bili-settings');
  const clearButton = document.getElementById('bili-clear');
  const toolbar = document.getElementById('bili-toolbar');
  const notice = document.getElementById('bili-notice');
  const accountTitle = document.getElementById('bili-sync-title');
  const accountMeta = document.getElementById('bili-sync-meta');
  const spaceLink = document.getElementById('bili-space-link');
  const loadWrap = document.getElementById('bili-load-wrap');
  const loadMoreButton = document.getElementById('bili-load-more');
  const filterButtons = [...document.querySelectorAll('[data-follow-status]')];

  const state = {
    uid: '',
    filter: 0,
    page: 0,
    total: 0,
    items: [],
    loading: false,
    hasResult: false,
    savedAt: 0,
  };
  let apiUrl = '';
  let generation = 0;
  let requestController;

  const statusLabels = {
    1: '想看',
    2: '在看',
    3: '看完',
  };

  function normalizeUid(value) {
    const uid = String(value || '').trim();
    return /^\d{1,20}$/.test(uid) && /[1-9]/.test(uid) ? uid.replace(/^0+/, '') : '';
  }

  function getDefaultUid() {
    const queryUid = normalizeUid(new URLSearchParams(location.search).get('uid'));
    const savedUid = normalizeUid(storage.get(UID_KEY));
    const configuredUid = typeof SITE !== 'undefined' ? normalizeUid(SITE.bilibiliUid) : '';
    return queryUid || savedUid || configuredUid;
  }

  function configuredApiUrl() {
    if (typeof SITE === 'undefined') return '';
    return String(SITE.bilibiliApiUrl || '').trim();
  }

  function isLocalHost() {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname.toLowerCase());
  }

  async function resolveApiUrl() {
    const configured = configuredApiUrl();
    if (configured) {
      try {
        const url = new URL(configured, document.baseURI);
        return url.protocol === 'https:' || (isLocalHost() && url.origin === location.origin)
          ? url.href : '';
      } catch {
        return '';
      }
    }
    if (!isLocalHost()) return '';

    // 本地完整服务器会为该路径返回 JSON；普通静态服务器返回 HTML 404。
    const localEndpoint = new URL('/api/bilibili/follows', location.origin);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_MS);
    try {
      const response = await fetch(localEndpoint, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      return contentType.includes('application/json')
        ? localEndpoint.href
        : '';
    } catch {
      return '';
    } finally {
      clearTimeout(timeout);
    }
  }

  function cacheKey() {
    return `${CACHE_PREFIX}:${encodeURIComponent(apiUrl)}:${state.uid}:${state.filter}`;
  }

  function setNotice(message, tone = '') {
    notice.textContent = message;
    notice.dataset.tone = tone;
  }

  function showStaticCards() {
    document.documentElement.classList.remove('bili-sync-active');
    grid.hidden = true;
    loadWrap.hidden = true;
  }

  function activateLiveGrid() {
    document.documentElement.classList.add('bili-sync-active');
    grid.hidden = false;
  }

  function showUnavailable() {
    showStaticCards();
    setup.hidden = true;
    refreshButton.hidden = true;
    settingsButton.hidden = true;
    clearButton.hidden = true;
    toolbar.hidden = true;
    const message = isLocalHost() ? '本地追番同步服务不可用' : '线上追番同步服务暂未启用';
    accountTitle.textContent = message;
    accountMeta.textContent = isLocalHost()
      ? '当前显示静态追番示例；请使用一键启动器或 tools/site-server.py 启动完整服务。'
      : '当前显示静态追番示例；独立 Worker/API 尚未配置，本站不会请求不存在的接口。';
    setNotice(message + '，当前内容为静态示例。', 'warn');
  }

  function setSetupOpen(open) {
    setup.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
    if (open) {
      uidInput.value = state.uid;
      uidInput.focus({ preventScroll: true });
    }
  }

  function updateAccountUi() {
    const bound = Boolean(state.uid);
    accountTitle.textContent = bound ? `UID ${state.uid}` : '尚未绑定账号';
    accountMeta.textContent = bound
      ? '正在读取该账号公开展示的追番收藏。'
      : '输入公开账号 UID 后，番名、年份、话数、状态和封面会自动同步。';
    refreshButton.hidden = !bound;
    toolbar.hidden = !bound;
    clearButton.hidden = !bound;
    spaceLink.href = bound
      ? `https://space.bilibili.com/${state.uid}/bangumi`
      : 'https://space.bilibili.com/';
    setSetupOpen(!bound);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);
  }

  function forceHttps(url) {
    try {
      const value = String(url || '').replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://');
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
    } catch { return ''; }
  }

  function resizedCover(url) {
    const source = forceHttps(url);
    return source ? `${source}@640w_360h_1c.webp` : '';
  }

  function formatCount(value) {
    const count = Number(value || 0);
    if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
    return count.toLocaleString('zh-CN');
  }

  function versionLabel(item) {
    const versions = {
      tv: 'TV',
      movie: '剧场版',
      ova: 'OVA',
      web: 'WEB',
      documentary: '纪录片',
    };
    return versions[item.season_version] || item.season_title || item.season_type_name || '番剧';
  }

  function normalizeItem(item) {
    const releaseDate = item.publish?.release_date || item.publish?.pub_time || '';
    const originalCover = forceHttps(item.horizontal_cover_16_9 || item.horizontal_cover_16_10 || item.cover);
    const portraitCover = forceHttps(item.cover || item.square_cover);
    const episodeText = item.new_ep?.index_show
      || (Number(item.total_count) > 0 ? `全${item.total_count}话` : '话数未定');
    const description = item.evaluate || item.summary || item.subtitle || 'Bilibili 暂未提供简介。';
    const followStatus = Number(item.follow_status || 0);

    return {
      id: Number(item.season_id || item.media_id || 0),
      title: item.title || '未命名番剧',
      year: /^\d{4}/.test(releaseDate) ? releaseDate.slice(0, 4) : '年份未定',
      area: item.areas?.map((area) => area.name).filter(Boolean).join(' / ') || '地区未定',
      type: versionLabel(item),
      episodeText,
      description: description.replace(/\s+/g, ' ').trim(),
      score: Number(item.rating?.score || 0),
      scoreCount: Number(item.rating?.count || 0),
      status: followStatus,
      statusLabel: statusLabels[followStatus] || '已追番',
      progress: item.progress || '',
      cover: resizedCover(originalCover || portraitCover),
      coverFallback: originalCover || portraitCover,
      url: forceHttps(item.url) || `https://www.bilibili.com/bangumi/play/ss${Number(item.season_id) || 0}`,
      tags: Array.isArray(item.styles) ? item.styles.slice(0, 3) : [],
      updateText: item.renewal_time || episodeText,
      badge: item.badge_info?.text || item.badge || '',
    };
  }

  async function proxyRequest(page, signal) {
    if (!apiUrl) throw new Error('追番同步服务暂未启用。');
    const url = new URL(apiUrl);
    url.searchParams.set('uid', state.uid);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(PAGE_SIZE));
    url.searchParams.set('follow_status', String(state.filter));

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error(`追番同步服务返回 HTTP ${response.status} 或非 JSON 数据，请稍后重试。`);
    }
    const payload = await response.json();
    if (!payload || payload.code !== 0 || !payload.data) {
      throw new Error(payload?.message || 'Bilibili 暂时拒绝了请求。');
    }
    if (!Array.isArray(payload.data.list) || !Number.isSafeInteger(payload.data.total)
      || payload.data.total < 0 || payload.data.total < payload.data.list.length
      || payload.data.list.some(item => !item || typeof item.title !== 'string'
        || !Number.isSafeInteger(Number(item.season_id)) || Number(item.season_id) <= 0)) {
      throw new Error('同步服务返回的数据格式无效。');
    }
    return payload.data;
  }

  function progressMarkup(item) {
    if (item.status === 3) {
      return '<div class="bgm-prog" aria-label="已看完"><i style="width:100%"></i></div>';
    }
    const progressMatch = String(item.progress).match(/(\d+)(?:\s*\/\s*(\d+))?/);
    const current = Number(progressMatch?.[1] || 0);
    const total = Number(progressMatch?.[2] || 0);
    if (!current || !total) return '';
    const percent = Math.min(100, Math.round((current / total) * 100));
    return `<div class="bgm-prog" aria-label="观看进度 ${percent}%"><i style="width:${percent}%"></i></div>`;
  }

  function cardMarkup(item, index) {
    const score = item.score
      ? `<div class="bili-rating"><span aria-hidden="true">★</span> B站 ${item.score.toFixed(1)}<em>${formatCount(item.scoreCount)} 人评分</em></div>`
      : '<div class="bili-rating muted">暂无公开评分</div>';
    const tags = item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
    const badge = item.badge ? `<span class="bili-cover-badge">${escapeHtml(item.badge)}</span>` : '';

    return `
      <article class="bgm-card bangumi-live-card" style="--card-delay:${Math.min(index, 9) * 45}ms">
        <a class="bili-card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="在 Bilibili 查看《${escapeHtml(item.title)}》">
          <div class="bgm-cover">
            <img class="bili-cover-image" src="${escapeHtml(item.cover)}" data-fallback="${escapeHtml(item.coverFallback)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="640" height="360">
            <div class="bili-cover-shade"></div>
            <div class="bili-cover-top">${badge}<span class="bili-year">${escapeHtml(item.year)}</span></div>
            <div class="bili-cover-tags">${tags}</div>
            <span class="bgm-state status-${item.status}">${escapeHtml(item.statusLabel)}</span>
          </div>
          <div class="bgm-body">
            <h2>${escapeHtml(item.title)}</h2>
            <span class="yr">${escapeHtml(item.area)} · ${escapeHtml(item.year)} · ${escapeHtml(item.type)} · ${escapeHtml(item.episodeText)}</span>
            ${score}
            <p>${escapeHtml(item.description)}</p>
            ${progressMarkup(item)}
            <div class="bili-card-foot"><span>${escapeHtml(item.updateText)}</span><span>Bilibili ↗</span></div>
          </div>
        </a>
      </article>`;
  }

  function wireCoverFallbacks() {
    grid.querySelectorAll('.bili-cover-image').forEach((image) => {
      image.addEventListener('error', () => {
        const fallback = image.dataset.fallback;
        if (fallback && image.src !== fallback) {
          image.src = fallback;
          image.removeAttribute('data-fallback');
          return;
        }
        image.closest('.bgm-cover')?.classList.add('cover-missing');
        image.remove();
      }, { once: false });
    });
  }

  function render() {
    activateLiveGrid();
    grid.innerHTML = state.items.map(cardMarkup).join('');
    wireCoverFallbacks();
    grid.dataset.empty = String(state.items.length === 0);
    loadWrap.hidden = state.items.length === 0 || state.items.length >= state.total;
    loadMoreButton.disabled = state.loading;
  }

  function renderEmpty(message) {
    activateLiveGrid();
    grid.innerHTML = `
      <div class="bili-empty">
        <span aria-hidden="true">📺</span>
        <h2>这里还没有公开记录</h2>
        <p>${escapeHtml(message)}</p>
      </div>`;
    grid.dataset.empty = 'true';
    loadWrap.hidden = true;
  }

  function saveCache() {
    try {
      state.savedAt = Date.now();
      storage.set(cacheKey(), JSON.stringify({
        savedAt: state.savedAt,
        total: state.total,
        page: state.page,
        items: state.items,
      }));
    } catch {
      // Storage may be disabled; live data still works.
    }
  }

  function restoreCache() {
    try {
      const cached = JSON.parse(storage.get(cacheKey()) || 'null');
      const age = Date.now() - cached?.savedAt;
      if (!cached || !Number.isFinite(cached.savedAt) || age < 0 || age > MAX_CACHE_MS
        || !Array.isArray(cached.items) || !Number.isSafeInteger(cached.page) || cached.page < 1
        || !Number.isSafeInteger(cached.total) || cached.total < cached.items.length
        || cached.items.some(item => !item || !Number.isSafeInteger(item.id) || item.id <= 0
          || typeof item.title !== 'string' || typeof item.description !== 'string'
          || !Array.isArray(item.tags) || !Number.isFinite(item.score)
          || !forceHttps(item.url) || (item.cover && !forceHttps(item.cover))
          || (item.coverFallback && !forceHttps(item.coverFallback)))) return false;
      state.items = cached.items;
      state.total = cached.total;
      state.page = cached.page;
      state.hasResult = true;
      state.savedAt = cached.savedAt;
      state.items.length ? render() : renderEmpty('上次同步没有公开记录，正在检查更新。');
      setNotice(`正在检查更新；${cacheDescription()}。`, age > STALE_MS ? 'warn' : '');
      return true;
    } catch {
      return false;
    }
  }

  function cacheDescription() {
    const savedTime = new Date(state.savedAt).toLocaleString('zh-CN');
    return `当前显示 ${savedTime} 的${Date.now() - state.savedAt > STALE_MS ? '旧' : ''}缓存，共 ${state.items.length} 部`;
  }

  function cancelRequest() {
    generation++;
    requestController?.abort();
    state.loading = false;
    grid.setAttribute('aria-busy', 'false');
    refreshButton.disabled = false;
    loadMoreButton.disabled = false;
  }

  async function loadPage({ reset = false } = {}) {
    if (!state.uid || state.loading) return;
    state.loading = true;
    const currentGeneration = generation;
    const controller = new AbortController();
    requestController = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_MS);
    grid.setAttribute('aria-busy', 'true');
    refreshButton.disabled = true;
    loadMoreButton.disabled = true;
    if (!state.items.length) setNotice('正在从 Bilibili 同步公开追番…');

    const requestedPage = reset ? 1 : state.page + 1;
    try {
      const data = await proxyRequest(requestedPage, controller.signal);
      if (currentGeneration !== generation) return;
      const incoming = (data.list || []).map(normalizeItem);
      const merged = reset ? incoming : [...state.items, ...incoming];
      state.items = [...new Map(merged.map((item) => [item.id, item])).values()];
      state.page = Number(data.pn || requestedPage);
      state.total = data.total;
      state.hasResult = true;
      render();
      saveCache();

      if (state.items.length === 0) {
        renderEmpty('该账号没有公开这一状态的追番，或追番列表未公开。');
        setNotice('没有读取到公开追番记录。', 'warn');
      } else {
        setNotice(`同步完成：已载入 ${state.items.length} / ${state.total} 部。`, 'success');
      }
    } catch (error) {
      if (currentGeneration !== generation) return;
      if (!state.hasResult) {
        showStaticCards();
      }
      const message = error.name === 'AbortError' ? '请求超过 15 秒，请稍后重试。' : error.message;
      setNotice(`同步失败：${message} ${state.hasResult ? cacheDescription() + '，可点击同步重试。' : '当前显示静态示例，可点击同步重试。'}`, 'error');
    } finally {
      clearTimeout(timeout);
      if (currentGeneration !== generation) return;
      state.loading = false;
      grid.setAttribute('aria-busy', 'false');
      refreshButton.disabled = false;
      loadMoreButton.disabled = false;
    }
  }

  function setUid(uid) {
    cancelRequest();
    state.uid = uid;
    state.page = 0;
    state.total = 0;
    state.items = [];
    state.hasResult = false;
    storage.set(UID_KEY, uid);
    updateAccountUi();
    setSetupOpen(false);
    if (!restoreCache()) {
      showStaticCards();
      setNotice('账号已绑定，准备同步…');
    }
    loadPage({ reset: true });
  }

  setup.addEventListener('submit', (event) => {
    event.preventDefault();
    const uid = normalizeUid(uidInput.value);
    if (!uid) {
      uidInput.setCustomValidity('请输入只包含数字的 Bilibili UID。');
      uidInput.reportValidity();
      return;
    }
    uidInput.setCustomValidity('');
    setUid(uid);
  });

  uidInput.addEventListener('input', () => uidInput.setCustomValidity(''));

  settingsButton.addEventListener('click', () => {
    setSetupOpen(setup.hidden);
  });

  refreshButton.addEventListener('click', () => loadPage({ reset: true }));
  loadMoreButton.addEventListener('click', () => loadPage());

  clearButton.addEventListener('click', () => {
    cancelRequest();
    storage.remove(UID_KEY);
    // 清除本接口、本账号的所有筛选缓存。
    for (let filter = 0; filter <= 3; filter++) {
      storage.remove(`${CACHE_PREFIX}:${encodeURIComponent(apiUrl)}:${state.uid}:${filter}`);
    }
    state.uid = '';
    state.items = [];
    state.page = 0;
    state.total = 0;
    state.hasResult = false;
    grid.innerHTML = '';
    showStaticCards();
    updateAccountUi();
    setNotice('账号绑定已清除；当前显示静态追番示例。');
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextFilter = Number(button.dataset.followStatus || 0);
      if (nextFilter === state.filter) return;
      cancelRequest();
      state.filter = nextFilter;
      state.page = 0;
      state.total = 0;
      state.items = [];
      state.hasResult = false;
      filterButtons.forEach((item) => {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      });
      if (!restoreCache()) {
        showStaticCards();
        setNotice(`正在读取“${button.textContent.trim()}”记录…`);
      }
      loadPage({ reset: true });
    });
  });

  apiUrl = await resolveApiUrl();
  filterButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.followStatus) === state.filter)));
  if (!apiUrl) {
    showUnavailable();
    return;
  }

  state.uid = getDefaultUid();
  updateAccountUi();
  if (state.uid) {
    restoreCache();
    loadPage({ reset: true });
  } else {
    showStaticCards();
    setNotice('本地追番同步服务已就绪；绑定公开 UID 后可载入真实记录。');
  }
})();
