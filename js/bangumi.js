/* ============================================================
   兔山手帖 · Bilibili 公开追番同步
   仅使用公开 UID，经可配置 API 或本地代理读取，不接触 Cookie 或登录凭据。
   ============================================================ */

(async () => {
  'use strict';

  const UID_KEY = 'usagiyama-bilibili-uid';
  const CACHE_PREFIX = 'usagiyama-bilibili-cache-v2';
  const PAGE_SIZE = 24;
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT = 15000;

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
    hasMore: false,
    fetchedAt: '',
    stale: false,
  };
  let apiUrl = '';
  let generation = 0;
  let activeController;

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing / quota. */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } },
  };

  const statusLabels = {
    1: '想看',
    2: '在看',
    3: '看完',
  };

  function normalizeUid(value) {
    const uid = String(value || '').trim().replace(/^0+/, '');
    return /^[1-9]\d{0,19}$/.test(uid) ? uid : '';
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
    const validate = (value) => {
      try {
        const url = new URL(value, document.baseURI);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        return !url.username && !url.password && (url.protocol === 'https:' || (isLocalHost() && local && url.protocol === 'http:')) ? url.href : '';
      } catch { return ''; }
    };
    if (configured) return validate(configured);
    // Static config works on Pages and project subpaths, without a build step.
    try {
      const response = await fetch(new URL('config/bilibili.json', document.baseURI), {
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const config = await response.json();
        if (typeof config.apiUrl === 'string' && config.apiUrl.trim()) return validate(config.apiUrl.trim());
      }
    } catch { /* Keep local discovery and a clear unconfigured state. */ }
    if (!isLocalHost()) return '';

    // 本地完整服务器会为该路径返回 JSON；普通静态服务器返回 HTML 404。
    const localEndpoint = new URL('api/bilibili/follows', document.baseURI);
    try {
      const response = await fetch(localEndpoint, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(4000),
      });
      const contentType = response.headers.get('content-type') || '';
      return contentType.includes('application/json')
        ? localEndpoint.href
        : '';
    } catch {
      return '';
    }
  }

  function cacheKey() {
    return `${CACHE_PREFIX}:${apiUrl}:${state.uid}:${state.filter}:${PAGE_SIZE}`;
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
    accountTitle.textContent = '线上追番同步服务暂未启用';
    accountMeta.textContent = '当前显示静态追番示例；配置独立 API 服务后即可启用在线同步。';
    setNotice('线上追番同步服务暂未启用。', 'warn');
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

  function forceHttps(value, kind = 'image') {
    try {
      const url = new URL(String(value || '').replace(/^\/\//, 'https://').replace(/^http:\/\//i, 'https://'));
      const domain = kind === 'image' ? 'hdslb.com' : 'bilibili.com';
      return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : '';
    } catch { return ''; }
  }

  function resizedCover(url) {
    const source = forceHttps(url);
    return source ? `${source.split('@')[0]}@640w_360h_1c.webp` : '';
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
    const followStatus = Number(item.follow_status || state.filter || 0);

    return {
      id: String(item.season_id || item.media_id || ''),
      title: String(item.title || '未命名番剧'),
      year: /^\d{4}/.test(releaseDate) ? releaseDate.slice(0, 4) : '年份未定',
      area: Array.isArray(item.areas) ? item.areas.map((area) => area?.name).filter(Boolean).join(' / ') : '地区未定',
      type: versionLabel(item),
      episodeText,
      description: String(description).replace(/\s+/g, ' ').trim(),
      score: Number(item.rating?.score || 0),
      scoreCount: Number(item.rating?.count || 0),
      status: followStatus,
      statusLabel: statusLabels[followStatus] || '已追番',
      progress: typeof item.progress === 'string' ? item.progress : '',
      totalEpisodes: Number(item.total_count) || 0,
      cover: resizedCover(originalCover || portraitCover),
      coverFallback: originalCover || portraitCover,
      url: forceHttps(item.url, 'link') || `https://www.bilibili.com/bangumi/play/ss${/^\d+$/.test(String(item.season_id)) ? item.season_id : ''}`,
      tags: Array.isArray(item.styles) ? item.styles.slice(0, 3) : [],
      updateText: item.renewal_time || episodeText,
      badge: item.badge_info?.text || item.badge || '',
    };
  }

  async function proxyRequest(page, uid, filter, signal) {
    if (!apiUrl) throw new Error('追番同步服务暂未启用。');
    const url = new URL(apiUrl);
    url.searchParams.set('uid', uid);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(PAGE_SIZE));
    url.searchParams.set('follow_status', String(filter));

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('追番服务返回异常，请稍后重试。');
    const payload = await response.json();
    if (!response.ok || !payload || payload.code !== 0 || !payload.data) {
      throw new Error(payload?.message || 'Bilibili 暂时拒绝了请求。');
    }
    if (!(Array.isArray(payload.data.list) || (payload.data.list == null && payload.data.total === 0)) || !Number.isSafeInteger(payload.data.total) || payload.data.total < 0) {
      throw new Error('追番服务返回的数据格式发生变化。');
    }
    payload.data.list ||= [];
    return payload;
  }

  function progressMarkup(item) {
    if (item.status === 3) {
      return '<div class="bgm-prog" aria-label="已看完"><i style="width:100%"></i></div>';
    }
    const progressMatch = String(item.progress).match(/(\d+)(?:\s*\/\s*(\d+))?/);
    const current = Number(progressMatch?.[1] || 0);
    const total = Number(progressMatch?.[2] || item.totalEpisodes || 0);
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
            ${item.cover ? `<img class="bili-cover-image" src="${escapeHtml(item.cover)}" data-fallback="${escapeHtml(item.coverFallback)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="640" height="360">` : '<span class="em" aria-label="暂无封面">📺</span>'}
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
            <div class="bili-progress-text">${escapeHtml(item.progress || (item.status === 3 ? '标记为已看完' : '未提供公开观看进度'))}</div>
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
    loadWrap.hidden = !state.hasMore;
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
      storage.set(cacheKey(), JSON.stringify({
        fetchedAt: state.fetchedAt,
        total: state.total,
        page: state.page,
        items: state.items,
        hasMore: state.hasMore,
      }));
    } catch {
      // Storage may be disabled; live data still works.
    }
  }

  function restoreCache() {
    try {
      const cached = JSON.parse(storage.get(cacheKey()) || 'null');
      const age = Date.now() - Date.parse(cached?.fetchedAt);
      if (!cached || !Array.isArray(cached.items) || !Number.isFinite(age) || age < 0 || age >= CACHE_MAX_AGE || !Number.isInteger(cached.page) || cached.page < 1) return false;
      if (cached.items.some(item => !item || typeof item.title !== 'string' || !Array.isArray(item.tags))) return false;
      // Revalidate external URLs even when reading browser storage.
      cached.items.forEach(item => {
        item.url = forceHttps(item.url, 'link') || 'https://www.bilibili.com/';
        item.cover = forceHttps(item.cover);
        item.coverFallback = forceHttps(item.coverFallback);
      });
      state.items = cached.items;
      state.total = Number(cached.total || cached.items.length);
      state.page = Number(cached.page || 1);
      state.hasMore = Boolean(cached.hasMore);
      state.fetchedAt = cached.fetchedAt;
      state.stale = true;
      render();
      if (!state.items.length) renderEmpty('最近一次同步没有公开追番记录，正在检查更新。');
      const savedTime = formatTime(state.fetchedAt);
      setNotice(`正在检查更新；当前显示 ${savedTime} 的缓存，共 ${state.items.length} 部。`);
      return true;
    } catch {
      return false;
    }
  }

  function formatTime(value) {
    return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function resetList() {
    generation += 1;
    activeController?.abort();
    Object.assign(state, { items: [], total: 0, page: 0, loading: false, hasMore: false, fetchedAt: '', stale: false });
    grid.setAttribute('aria-busy', 'false');
    refreshButton.disabled = false;
    loadMoreButton.disabled = false;
  }

  async function loadPage({ reset = false } = {}) {
    if (!state.uid || state.loading) return;
    state.loading = true;
    grid.setAttribute('aria-busy', 'true');
    refreshButton.disabled = true;
    loadMoreButton.disabled = true;
    if (!state.items.length) setNotice('正在从 Bilibili 同步公开追番…');

    const requestedPage = reset ? 1 : state.page + 1;
    const requestedGeneration = ++generation;
    const controller = new AbortController();
    activeController = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const { data, meta = {} } = await proxyRequest(requestedPage, state.uid, state.filter, controller.signal);
      if (requestedGeneration !== generation) return;
      const incoming = data.list.filter(item => item && (item.season_id || item.media_id)).map(normalizeItem);
      if (incoming.length !== data.list.length) throw new Error('番剧列表格式无效。');
      const previousCount = reset ? 0 : state.items.length;
      const merged = reset ? incoming : [...state.items, ...incoming];
      state.items = [...new Map(merged.map((item) => [item.id, item])).values()];
      state.page = requestedPage;
      state.total = data.total;
      // Stop if the upstream repeats or empties a page despite its advertised total.
      state.hasMore = incoming.length > 0 && state.items.length > previousCount && requestedPage * PAGE_SIZE < state.total;
      const fetchedAt = Number.isFinite(Date.parse(meta.fetchedAt)) ? meta.fetchedAt : new Date().toISOString();
      state.fetchedAt = reset || !state.fetchedAt || Date.parse(fetchedAt) < Date.parse(state.fetchedAt) ? fetchedAt : state.fetchedAt;
      state.stale = Boolean(meta.stale) || (!reset && state.stale);
      render();
      saveCache();

      if (state.items.length === 0) {
        renderEmpty('该账号没有公开这一状态的追番，或追番列表未公开。');
        setNotice('没有读取到公开追番记录。', 'warn');
      } else {
        const stalled = !state.hasMore && state.items.length < state.total;
        setNotice(`${state.stale ? '上游暂不可用，显示旧缓存' : '同步完成'}：已载入 ${state.items.length} / ${state.total} 部；数据时间 ${formatTime(state.fetchedAt)}。${stalled ? '列表有变动或分页已结束，可点击同步重新读取。' : ''}`, state.stale || stalled ? 'warn' : 'success');
      }
    } catch (error) {
      if (requestedGeneration !== generation) return;
      if (!state.page) {
        showStaticCards();
      }
      const reason = error.name === 'AbortError' ? '请求超时，请稍后重试。' : error.message;
      setNotice(`同步失败：${reason}${state.page ? ` 当前保留 ${formatTime(state.fetchedAt)} 的缓存。` : ' 当前显示静态示例，不代表该账号的收藏。'}`, 'error');
    } finally {
      clearTimeout(timer);
      if (requestedGeneration === generation) {
        state.loading = false;
        grid.setAttribute('aria-busy', 'false');
        refreshButton.disabled = false;
        loadMoreButton.disabled = false;
      }
    }
  }

  function setUid(uid) {
    resetList();
    state.uid = uid;
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
    storage.remove(UID_KEY);
    resetList();
    state.uid = '';
    grid.innerHTML = '';
    showStaticCards();
    updateAccountUi();
    setNotice('账号绑定已清除；当前显示静态追番示例。');
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextFilter = Number(button.dataset.followStatus || 0);
      if (nextFilter === state.filter || !state.uid) return;
      resetList();
      state.filter = nextFilter;
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
    setNotice('追番同步服务已就绪；绑定公开 UID 后可载入真实记录。');
  }
})();
