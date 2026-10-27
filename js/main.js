/* ============================================================
   兔山手帖 · 交互脚本（零依赖）
   —— 悬浮组件全部由本文件注入，页面 HTML 保持干净 ——
   ============================================================ */
(() => {
  'use strict';
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const ROOT = document.body.dataset.root || '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


  // Access can fail in privacy/file modes; malformed saved data must not stop the page.
  const safeStorage = name => ({
    getItem(key) { try { return window[name].getItem(key); } catch { return null; } },
    setItem(key, value) { try { window[name].setItem(key, String(value)); } catch {} }
  });
  const localStore = safeStorage('localStorage');
  const sessionStore = safeStorage('sessionStorage');

  /* ═══════════ 0. 注入悬浮组件 ═══════════ */
  const MASCOT_SVG = `
  <svg class="mbody" viewBox="0 0 100 100" aria-hidden="true">
    <ellipse cx="50" cy="93" rx="26" ry="5" fill="rgba(120,80,50,.14)"/>
    <ellipse cx="22" cy="56" rx="12" ry="8" fill="#F3E3CE" transform="rotate(24 22 56)"/>
    <ellipse cx="78" cy="56" rx="12" ry="8" fill="#F3E3CE" transform="rotate(-24 78 56)"/>
    <circle cx="50" cy="54" r="32" fill="#FFF9F0" stroke="#E0C6AC" stroke-width="3"/>
    <ellipse cx="50" cy="66" rx="20" ry="13" fill="#FFEFD6"/>
    <path d="M50 22 q3 -9 11 -7" fill="none" stroke="#E0C6AC" stroke-width="3" stroke-linecap="round"/>
    <ellipse class="eye" cx="39" cy="48" rx="3.4" ry="3.8" fill="#4A3A30"/>
    <ellipse class="eye" cx="61" cy="48" rx="3.4" ry="3.8" fill="#4A3A30"/>
    <circle cx="31" cy="56" r="4.8" fill="#F8AFC5" opacity=".85"/>
    <circle cx="69" cy="56" r="4.8" fill="#F8AFC5" opacity=".85"/>
    <path d="M43.5 53 Q50 46 56.5 53 Q50 60 43.5 53" fill="#F2A65A"/>
    <path d="M50 77 c-3.5 -4 -9 -1 -6 3.4 l6 4.6 6 -4.6 c3 -4.4 -2.5 -7.4 -6 -3.4" fill="#E4573D"/>
    <ellipse cx="42" cy="87" rx="5" ry="2.6" fill="#E8A25A"/>
    <ellipse cx="58" cy="87" rx="5" ry="2.6" fill="#E8A25A"/>
  </svg>`;
  document.body.insertAdjacentHTML('beforeend', `
  <canvas id="petals" aria-hidden="true"></canvas>
  <div id="read-bar" aria-hidden="true"></div>
  <button id="backtop" aria-label="回到顶部">
    <svg class="ring" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22"/></svg>
    <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 19V6M5.5 12.5 12 6l6.5 6.5"/></svg>
  </button>
  <div id="mascot" title="看板娘 · 大福">${MASCOT_SVG}
    <div class="bubble" id="bubble"></div>
    <button id="mascot-hide" aria-label="隐藏看板娘">✕</button>
  </div>
  <div id="search-mask" role="dialog" aria-label="全站搜索">
    <div class="search-box">
      <div class="search-top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
        <input id="search-input" type="text" placeholder="搜索文章标题、标签、摘要…" autocomplete="off">
        <kbd>Esc</kbd>
      </div>
      <div id="search-results"></div>
      <div class="search-foot"><span>↑↓ 选择</span><span>Enter 打开</span><span>Ctrl K 唤起</span></div>
    </div>
  </div>
  <div id="ctx-menu">
    <button id="ctx-top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19V6M5.5 12.5 12 6l6.5 6.5"/></svg>回到顶部</button>
    <button id="ctx-random"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.6" fill="currentColor"/></svg>随机逛一篇</button>
    <button id="ctx-theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.4 14.2A8.5 8.5 0 1 1 9.8 3.6a7 7 0 1 0 10.6 10.6Z"/></svg>切换昼夜</button>
    <div class="sep"></div>
    <button id="ctx-copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>复制选中文字</button>
    <button id="ctx-home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v9h5v-5h4v5h5v-9"/></svg>回到首页</button>
    <button id="ctx-reload"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"/></svg>刷新页面</button>
    <div class="hint">Shift + 右键 使用系统菜单</div>
  </div>`);

  /* ═══════════ 1. 主题（圆形扩散切换） ═══════════ */
  const metaColor = $('meta[name="theme-color"]');
  const syncMeta = () => { if (metaColor) metaColor.content = document.documentElement.dataset.theme === 'dark' ? '#211F2E' : '#FFF7EE'; };
  syncMeta();
  const setTheme = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStore.setItem('mochi-theme', next);
    syncMeta();
  };
  let vtBusy = false;
  const toggleTheme = (x = innerWidth - 60, y = 40) => {
    // 不支持 / 减弱动画 / 页面不可见 / 上一次切换未结束 → 直接切，不玩花活
    if (!document.startViewTransition || reduced || document.hidden || vtBusy) { setTheme(); return; }
    let vt;
    try { vt = document.startViewTransition(setTheme); }
    catch { setTheme(); return; }
    vtBusy = true;
    const unlock = () => { vtBusy = false; };
    vt.finished.then(unlock, unlock);
    // 兜底：1.2s 内快照仍未就绪（如渲染被挂起）就跳过动画，保证主题立即生效
    const guard = setTimeout(() => { try { vt.skipTransition(); } catch {} }, 1200);
    vt.ready.then(() => {
      clearTimeout(guard);
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 640, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
  };
  $('#theme-btn')?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    toggleTheme(r.left + r.width / 2, r.top + r.height / 2);
  });

  /* ═══════════ 2. 开屏 / 顶栏 ═══════════ */
  const loader = $('#loader');
  if (loader) {
    const bye = () => loader.classList.add('bye');
    if (sessionStore.getItem('mochi-seen')) bye();
    else {
      sessionStore.setItem('mochi-seen', '1');
      window.addEventListener('load', () => setTimeout(bye, 450));
      setTimeout(bye, 2200);
    }
  }
  const head = $('.site-head');
  const syncHead = () => head?.classList.toggle('solid', scrollY > 24 || !$('.hero'));
  syncHead();
  $('#burger')?.addEventListener('click', () => $('.m-nav')?.classList.toggle('open'));

  /* ═══════════ 3. 打字机 ═══════════ */
  const typeEl = $('#typing');
  if (typeEl && typeof TYPING !== 'undefined') {
    let li = 0, ci = 0, del = false;
    const tick = () => {
      const line = TYPING[li];
      typeEl.textContent = line.slice(0, ci);
      let wait = del ? 38 : 105;
      if (!del && ci === line.length) { del = true; wait = 2800; }
      else if (del && ci === 0) { del = false; li = (li + 1) % TYPING.length; wait = 460; }
      else ci += del ? -1 : 1;
      setTimeout(tick, wait);
    };
    reduced ? (typeEl.textContent = TYPING[0]) : tick();
  }

  /* ═══════════ 4. 封面插画生成器（手绘 SVG 模板） ═══════════ */
  let gid = 0;
  const MOTIFS = {
    street: `
      <path d="M70 176 h64 v-58 h-64 Z" fill="#FFFFFF" opacity=".92"/>
      <path d="M62 112 h80 v14 h-80 Z" rx="6" fill="#E4573D" opacity=".85"/>
      <rect x="82" y="136" width="22" height="20" rx="3" fill="#FFD98A"/>
      <rect x="112" y="140" width="16" height="36" rx="3" fill="#C09A78"/>
      <path d="M170 176 h56 v-48 h-56 Z" fill="#FFFFFF" opacity=".8"/>
      <path d="M164 120 h68 v12 h-68 Z" fill="#7FA96B" opacity=".85"/>
      <rect x="182" y="140" width="20" height="18" rx="3" fill="#FFD98A"/>
      <rect x="252" y="92" width="9" height="84" rx="4.5" fill="#C97B6B"/>
      <rect x="318" y="92" width="9" height="84" rx="4.5" fill="#C97B6B"/>
      <rect x="240" y="82" width="100" height="12" rx="6" fill="#C97B6B"/>
      <rect x="252" y="42" width="76" height="34" rx="9" fill="#FFF8EE"/>
      <rect x="258" y="28" width="8" height="16" rx="4" fill="#C97B6B"/><rect x="314" y="28" width="8" height="16" rx="4" fill="#C97B6B"/>
      <circle cx="270" cy="59" r="4" fill="#F8AFC5"/><circle cx="290" cy="59" r="4" fill="#FFF"/><circle cx="310" cy="59" r="4" fill="#A8C69F"/>
      <path d="M40 90 Q 200 64 360 90" stroke="#B98F72" stroke-width="2.4" fill="none"/>
      <circle cx="110" cy="82" r="6" fill="#FFC97E"/><circle cx="200" cy="75" r="6" fill="#FFC97E"/><circle cx="290" cy="79" r="6" fill="#FFC97E"/>
      <rect x="0" y="176" width="400" height="64" fill="#FFFFFF" opacity=".35"/>`,
    bird: `
      <ellipse cx="200" cy="196" rx="64" ry="9" fill="#FFF" opacity=".4"/>
      <ellipse cx="152" cy="128" rx="20" ry="13" fill="#F3E3CE" transform="rotate(26 152 128)"/>
      <ellipse cx="248" cy="128" rx="20" ry="13" fill="#F3E3CE" transform="rotate(-26 248 128)"/>
      <circle cx="200" cy="126" r="52" fill="#FFF9F0" stroke="#E8D2B8" stroke-width="4"/>
      <ellipse cx="200" cy="146" rx="32" ry="20" fill="#FFEFD6"/>
      <path d="M200 74 q5 -14 18 -11" fill="none" stroke="#E8D2B8" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="182" cy="118" rx="5.5" ry="6" fill="#4A3A30"/><ellipse cx="218" cy="118" rx="5.5" ry="6" fill="#4A3A30"/>
      <circle cx="169" cy="131" r="7.5" fill="#F8AFC5" opacity=".9"/><circle cx="231" cy="131" r="7.5" fill="#F8AFC5" opacity=".9"/>
      <path d="M189 128 Q200 116 211 128 Q200 139 189 128" fill="#F2A65A"/>
      <path d="M200 163 c-5.5 -6.4 -14.5 -1.6 -9.6 5.4 l9.6 7.4 9.6 -7.4 c4.9 -7 -4.1 -11.8 -9.6 -5.4" fill="#E4573D"/>
      <circle cx="118" cy="60" r="7" fill="#FFF" opacity=".7"/><circle cx="292" cy="76" r="5" fill="#FFF" opacity=".6"/><circle cx="308" cy="52" r="9" fill="#FFF" opacity=".5"/>`,
    window: `
      <rect x="118" y="42" width="164" height="156" rx="12" fill="#FFF9EE" opacity=".95"/>
      <rect x="132" y="56" width="136" height="112" rx="7" fill="#FFE1AE"/>
      <path d="M200 56 v112 M132 112 h136" stroke="#D9B98E" stroke-width="5"/>
      <path d="M140 64 L196 160 M212 64 L262 150" stroke="#FFF" stroke-width="10" opacity=".4"/>
      <path d="M132 56 q10 60 0 112" stroke="#F8AFC5" stroke-width="14" fill="none" opacity=".85"/>
      <path d="M268 56 q-10 60 0 112" stroke="#F8AFC5" stroke-width="14" fill="none" opacity=".85"/>
      <rect x="118" y="182" width="164" height="12" rx="6" fill="#D9B98E"/>
      <path d="M96 198 h30 l-5 -26 h-20 Z" fill="#C97B6B"/>
      <ellipse cx="111" cy="160" rx="17" ry="14" fill="#7FA96B"/><ellipse cx="102" cy="150" rx="9" ry="8" fill="#8FBE8A"/>
      <circle cx="318" cy="188" r="4" fill="#FFF" opacity=".8"/><circle cx="80" cy="70" r="6" fill="#FFF" opacity=".6"/>`,
    torii: `
      <path d="M0 190 Q 200 172 400 190 L400 240 L0 240 Z" fill="#9CD3E8" opacity=".75"/>
      <ellipse cx="132" cy="196" rx="26" ry="9" fill="#7FA96B"/>
      <ellipse cx="196" cy="205" rx="22" ry="8" fill="#8FBE8A"/>
      <ellipse cx="256" cy="197" rx="24" ry="8" fill="#7FA96B"/>
      <rect x="150" y="84" width="11" height="86" rx="5" fill="#E4573D"/>
      <rect x="240" y="84" width="11" height="86" rx="5" fill="#E4573D"/>
      <rect x="132" y="94" width="136" height="10" rx="5" fill="#E4573D"/>
      <path d="M124 74 h152 q6 0 4 8 l-2 6 h-156 l-2 -6 q-2 -8 4 -8" fill="#C7402E"/>
      <rect x="192" y="104" width="17" height="22" rx="3" fill="#C7402E"/>
      <circle cx="86" cy="52" r="9" fill="#FFF" opacity=".7"/><circle cx="330" cy="64" r="6" fill="#FFF" opacity=".6"/>
      <path d="M60 218 q20 -7 40 0 M300 222 q20 -7 40 0" stroke="#FFF" stroke-width="4" fill="none" opacity=".65"/>`,
    seasons: `
      <g opacity=".93">
      <rect x="52" y="46" width="70" height="148" rx="12" fill="#FBD3DE"/>
      <rect x="128" y="46" width="70" height="148" rx="12" fill="#C8E6C0"/>
      <rect x="204" y="46" width="70" height="148" rx="12" fill="#FFD9A0"/>
      <rect x="280" y="46" width="70" height="148" rx="12" fill="#CFE3F2"/>
      </g>
      <circle cx="87" cy="86" r="9" fill="#F591AC"/><circle cx="76" cy="118" r="5" fill="#F591AC" opacity=".8"/><circle cx="98" cy="148" r="6.5" fill="#F591AC" opacity=".6"/>
      <path d="M163 76 q14 18 0 36 q-14 -18 0 -36" fill="#5F8F55"/><circle cx="163" cy="140" r="9" fill="#7FA96B"/>
      <circle cx="239" cy="88" r="10" fill="#E8A25A"/><path d="M232 130 h14 M239 123 v14" stroke="#C97B4A" stroke-width="4" stroke-linecap="round"/><circle cx="239" cy="158" r="6" fill="#E4573D" opacity=".8"/>
      <circle cx="315" cy="84" r="8" fill="#FFF"/><circle cx="306" cy="120" r="5" fill="#FFF" opacity=".9"/><circle cx="324" cy="150" r="6.5" fill="#FFF" opacity=".8"/>`,
    rocket: `
      <path d="M200 40 q34 34 34 88 l-14 26 h-40 l-14 -26 q0 -54 34 -88" fill="#FFF9F0"/>
      <circle cx="200" cy="110" r="17" fill="#9CD3E8" stroke="#FFF" stroke-width="5"/>
      <path d="M166 128 q-24 10 -26 40 q20 -4 30 -14 M234 128 q24 10 26 40 q-20 -4 -30 -14" fill="#F591AC"/>
      <path d="M186 158 q14 10 28 0 l-6 26 q-8 6 -16 0 Z" fill="#E4573D"/>
      <path d="M200 190 q-8 16 0 30 q8 -14 0 -30" fill="#FFC96B"/>
      <circle cx="96" cy="70" r="4" fill="#FFF" opacity=".8"/><circle cx="316" cy="90" r="5" fill="#FFF" opacity=".7"/><circle cx="90" cy="170" r="6" fill="#FFF" opacity=".55"/>
      <circle cx="300" cy="180" r="7" fill="#FFF" opacity=".8"/><circle cx="330" cy="176" r="4" fill="#FFF" opacity=".6"/>
      <path d="M60 210 h60 M140 210 h40 M200 210 h80" stroke="#FFF" stroke-width="5" stroke-linecap="round" opacity=".5"/>`,
  };
  const coverSVG = (cv) => {
    const id = 'cg' + (++gid);
    return `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${cv.a}"/><stop offset="1" stop-color="${cv.b}"/>
      </linearGradient></defs>
      <rect width="400" height="240" fill="url(#${id})"/>
      <circle cx="356" cy="28" r="60" fill="#FFF" opacity=".14"/>
      <circle cx="30" cy="216" r="46" fill="#FFF" opacity=".12"/>
      ${MOTIFS[cv.m] || MOTIFS.street}
    </svg>`;
  };

  /* ═══════════ 5. 工具：相对时间 / 已读 ═══════════ */
  const relTime = (ds) => {
    const d = Math.floor((Date.now() - new Date(ds + 'T00:00:00')) / 864e5);
    if (d <= 0) return '今天';
    if (d === 1) return '昨天';
    if (d < 30) return d + ' 天前';
    if (d < 365) return Math.floor(d / 30) + ' 个月前';
    return Math.floor(d / 365) + ' 年前';
  };
  let readItems = [];
  try { const value = JSON.parse(localStore.getItem('mochi-read') || '[]'); if (Array.isArray(value)) readItems = value.filter(item => typeof item === 'string'); } catch {}
  const readSet = new Set(readItems);

  /* ═══════════ 6. 首页：文章流 / 推荐卡 / 标签云 / 归档卡 ═══════════ */
  const feed = $('#feed');
  if (feed && typeof POSTS !== 'undefined') {
    feed.innerHTML = POSTS.map((p) => {
      const c = CATS[p.cat];
      return `
      <a class="pcard${p.top ? ' top' : ''}" href="${ROOT}${p.url}" style="--cat-c:${c.c}">
        <div class="pc-cover">${coverSVG(p.cover)}
          <div class="pc-badges">
            <span class="pc-cat">${c.name}</span>
            ${p.top ? '<span class="pc-pin">📌 置顶</span>' : ''}
            ${readSet.has(p.id) ? '' : '<span class="pc-unread">未读</span>'}
          </div>
        </div>
        <div class="pc-body">
          <b class="pc-title">${esc(p.title)}</b>
          <p class="pc-ex">${esc(p.excerpt)}</p>
          <div class="pc-foot">
            ${p.tags.slice(0, 2).map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}
            <time title="${p.date} · 约 ${p.mins} 分钟读完">${relTime(p.date)}</time>
          </div>
        </div>
      </a>`;
    }).join('');
  }

  /* 随便逛逛 · 随机推荐 */
  const reco = $('#hero-reco');
  if (reco && typeof POSTS !== 'undefined' && POSTS.length) {
    let cur = -1;
    const roll = () => {
      let i; do { i = Math.random() * POSTS.length | 0; } while (i === cur && POSTS.length > 1);
      cur = i;
      const p = POSTS[i];
      $('#reco-link').href = ROOT + p.url;
      $('#reco-cover').innerHTML = coverSVG(p.cover);
      $('#reco-title').textContent = p.title;
      $('#reco-meta').textContent = `${CATS[p.cat].name} · ${relTime(p.date)} · 约 ${p.mins} 分钟`;
    };
    roll();
    $('#reco-next')?.addEventListener('click', roll);
  }

  /* 热门标签（带计数） */
  const cloud = $('#tag-cloud');
  if (cloud && typeof POSTS !== 'undefined') {
    const cnt = {};
    POSTS.forEach(p => p.tags.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
    cloud.innerHTML = Object.entries(cnt).sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `<a class="tag-pill" href="${ROOT}archive.html#tag=${encodeURIComponent(t)}">${esc(t)}<sup>${n}</sup></a>`).join('');
  }

  /* 按月归档卡 */
  const mini = $('#mini-arc');
  if (mini && typeof POSTS !== 'undefined') {
    const g = {};
    POSTS.forEach(p => { const k = p.date.slice(0, 7); g[k] = (g[k] || 0) + 1; });
    mini.innerHTML = Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, n]) => {
        const [y, m] = k.split('-');
        return `<li><a href="${ROOT}archive.html#month=${encodeURIComponent(k)}"><span>${y} 年 ${+m} 月</span><b><em>${n}</em>篇</b></a></li>`;
      }).join('');
  }

  /* 统计数字 */
  if (typeof POSTS !== 'undefined') {
    const tagN = new Set(POSTS.flatMap(p => p.tags)).size;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#stat-posts', POSTS.length); set('#stat-posts2', POSTS.length + ' 篇');
    set('#stat-tags', tagN);
    set('#stat-words', (typeof SITE !== 'undefined' ? SITE.words : '-') + ' 字');
    if (POSTS.length) set('#stat-updated', relTime(POSTS[0].date));
  }
  if (typeof SITE !== 'undefined') {
    const diff = Math.max(1, Math.ceil((Date.now() - new Date(SITE.since + 'T00:00:00')) / 864e5));
    $$('.js-days').forEach(el => el.textContent = diff);
  }
  const visitEl = $('#visit-count');
  if (visitEl) {
    let v = Math.max(0, Number(localStore.getItem('mochi-visits')) || 0);
    if (!sessionStore.getItem('mochi-counted')) {
      v += 1; localStore.setItem('mochi-visits', v); sessionStore.setItem('mochi-counted', '1');
    }
    visitEl.textContent = v;
  }
  $$('.js-year').forEach(el => el.textContent = new Date().getFullYear());

  /* ═══════════ 7. 碎碎念（侧栏卡 + 英雄区胶囊） ═══════════ */
  if (typeof MOMENTS !== 'undefined') {
    const moBox = $('#moment-box'), dots = $('#moment-dots'), heroMo = $('#hero-moment span');
    let idx = 0, timer;
    const show = () => {
      const m = MOMENTS[idx];
      if (moBox) {
        moBox.innerHTML = `<div class="moment-item"><time>${m.t}</time>${esc(m.s)}</div>`;
        $$('i', dots).forEach((d, i) => d.classList.toggle('on', i === idx));
      }
      if (heroMo) { heroMo.style.animation = 'none'; void heroMo.offsetWidth; heroMo.style.animation = ''; heroMo.textContent = m.s; }
    };
    const reset = () => { clearInterval(timer); timer = setInterval(() => { idx = (idx + 1) % MOMENTS.length; show(); }, 6000); };
    if (dots) MOMENTS.forEach((_, i) => {
      const d = document.createElement('i');
      d.addEventListener('click', () => { idx = i; show(); reset(); });
      dots.appendChild(d);
    });
    $('#hero-moment')?.addEventListener('click', () => { idx = (idx + 1) % MOMENTS.length; show(); reset(); });
    show(); reset();
  }

  /* ═══════════ 8. 樱花画布 ═══════════ */
  const canvas = $('#petals');
  if (canvas && !reduced) {
    const ctx = canvas.getContext('2d');
    let W, H, petals = [], raf;
    const COLORS = ['#FBC7D6', '#F8AFC5', '#FDDDE7', '#F69BB8'];
    const make = (top) => ({
      x: Math.random() * W, y: top ? -20 : Math.random() * H,
      r: 4.5 + Math.random() * 4, vy: .35 + Math.random() * .5,
      sway: 18 + Math.random() * 30, phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * .02, rot: Math.random() * Math.PI,
      c: COLORS[Math.random() * COLORS.length | 0], o: .45 + Math.random() * .4,
    });
    const resize = () => {
      W = canvas.width = innerWidth; H = canvas.height = innerHeight;
      petals = Array.from({ length: Math.min(16, Math.max(8, W / 95 | 0)) }, () => make(false));
    };
    resize(); addEventListener('resize', resize);
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of petals) {
        p.y += p.vy; p.phase += .008; p.rot += p.spin;
        if (p.y > H + 24) Object.assign(p, make(true));
        ctx.save();
        ctx.translate(p.x + Math.sin(p.phase) * p.sway, p.y);
        ctx.rotate(p.rot); ctx.globalAlpha = p.o; ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.moveTo(0, -p.r);
        ctx.bezierCurveTo(p.r, -p.r * .6, p.r * .9, p.r * .7, 0, p.r);
        ctx.bezierCurveTo(-p.r * .9, p.r * .7, -p.r, -p.r * .6, 0, -p.r);
        ctx.fill(); ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    });
  }

  /* ═══════════ 9. 点击爆花 ═══════════ */
  if (!reduced) {
    const EMO = ['🌸', '💮', '✨', '🍡'];
    document.addEventListener('click', (e) => {
      if (e.target.closest('a,button,input,#mascot,.search-box')) return;
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('span');
        s.className = 'burst';
        s.textContent = EMO[Math.random() * EMO.length | 0];
        const a = Math.PI * 2 * i / 5 + Math.random();
        s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--dx:${Math.cos(a) * 46}px;--dy:${Math.sin(a) * 46 - 26}px`;
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 950);
      }
    });
  }

  /* ═══════════ 10. 商店街时钟 ═══════════ */
  const clockDigit = $('#clock-digit');
  if (clockDigit) {
    const hh = $('#hand-h'), mh = $('#hand-m'), sh = $('#hand-s');
    const pill = $('#open-pill'), dateEl = $('#clock-date');
    const WD = ['日', '一', '二', '三', '四', '五', '六'];
    const tick = () => {
      const d = new Date(), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
      clockDigit.textContent = [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
      if (dateEl) dateEl.textContent = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WD[d.getDay()]}`;
      hh?.setAttribute('transform', `rotate(${(h % 12) * 30 + m * .5} 60 60)`);
      mh?.setAttribute('transform', `rotate(${m * 6 + s * .1} 60 60)`);
      sh?.setAttribute('transform', `rotate(${s * 6} 60 60)`);
      if (pill) {
        const open = h >= 8 && h < 20;
        pill.textContent = open ? '· 商店街营业中 ·' : '· 打烊了 zzZ ·';
        pill.classList.toggle('closed', !open);
      }
    };
    tick(); setInterval(tick, 1000);
  }

  /* ═══════════ 11. 音乐盒《商店街的午后》 ═══════════ */
  const musicCard = $('#music-card');
  if (musicCard) {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ac, master, timer, pos = 0, bar = 0, nextT = 0;
    const U = .42;
    const MELODY = [
      [76,1],[79,1],[81,1],[79,1],[76,1],[72,1],[74,1],[76,1],
      [79,1],[76,2],[0,1],[76,1],[79,1],[81,1],[84,1],[83,1],
      [81,1],[79,1],[76,1],[74,1],[72,2],[0,1],[81,1],[84,1],
      [83,1],[81,1],[79,1],[76,1],[79,1],[81,1],[79,1],[76,2],
      [0,1],[74,1],[76,1],[79,1],[81,1],[79,1],[74,1],[76,3],
      [72,2],[0,2],
    ];
    const BASS = [60, 55, 53, 55];
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const pluck = (midi, t, dur, gain) => {
      if (!midi) return;
      const o1 = ac.createOscillator(), o2 = ac.createOscillator();
      const g = ac.createGain(), g2 = ac.createGain();
      o1.type = 'sine'; o2.type = 'triangle';
      o1.frequency.value = f(midi); o2.frequency.value = f(midi) * 2;
      o1.detune.value = (Math.random() - .5) * 5;
      g2.gain.value = .2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(dur * 1.9, 1.3));
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
      o1.start(t); o2.start(t); o1.stop(t + 2.4); o2.stop(t + 2.4);
    };
    const schedule = () => {
      while (nextT < ac.currentTime + .6) {
        const [m, beats] = MELODY[pos];
        pluck(m, nextT, beats * U, .5);
        if (pos % 4 === 0) { pluck(BASS[bar % 4], nextT, U * 3, .15); bar++; }
        nextT += beats * U;
        pos = (pos + 1) % MELODY.length;
        if (pos === 0) bar = 0;
      }
    };
    $('#music-btn')?.addEventListener('click', () => {
      if (!AC) return;
      if (musicCard.classList.contains('playing')) {
        clearInterval(timer); ac.suspend();
        musicCard.classList.remove('playing');
        return;
      }
      if (!ac) {
        ac = new AC();
        master = ac.createGain(); master.gain.value = .5;
        master.connect(ac.destination);
      }
      ac.resume();
      pos = 0; bar = 0; nextT = ac.currentTime + .1;
      schedule(); timer = setInterval(schedule, 200);
      musicCard.classList.add('playing');
    });
  }

  /* ═══════════ 12. 看板娘 · 大福 ═══════════ */
  const mascot = $('#mascot');
  if (mascot) {
    if (sessionStore.getItem('mascot-hidden')) mascot.style.display = 'none';
    const bubble = $('#bubble');
    let bt, clicks = 0, ct;
    const say = (text, ms = 2800) => {
      bubble.textContent = text;
      bubble.classList.add('show');
      clearTimeout(bt);
      bt = setTimeout(() => bubble.classList.remove('show'), ms);
    };
    mascot.addEventListener('click', (e) => {
      if (e.target.closest('#mascot-hide')) return;
      clicks++; clearTimeout(ct); ct = setTimeout(() => clicks = 0, 520);
      if (clicks >= 3) { clicks = 0; mochiRain(); say('哇——年糕雨！🍡', 3200); return; }
      if (typeof QUOTES !== 'undefined') say(QUOTES[Math.random() * QUOTES.length | 0]);
    });
    $('#mascot-hide')?.addEventListener('click', () => {
      mascot.style.display = 'none';
      sessionStore.setItem('mascot-hidden', '1');
    });
    if (!sessionStore.getItem('mochi-greeted')) {
      sessionStore.setItem('mochi-greeted', '1');
      setTimeout(() => say('欢迎来到兔山商店街～', 3000), 1600);
    }
  }
  const mochiRain = () => {
    const kinds = ['#F8A5BC', '#FFF6EA', '#A8C69F'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('div');
      s.className = 'mochi-drop';
      const size = 15 + Math.random() * 16;
      s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="13" r="10" fill="${kinds[i % 3]}" stroke="#D9BFA8" stroke-width="1"/><ellipse cx="9" cy="9" rx="3.4" ry="2.2" fill="#FFF" opacity=".75"/></svg>`;
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = 2.2 + Math.random() * 2.4 + 's';
      s.style.animationDelay = Math.random() * .9 + 's';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 6200);
    }
  };

  /* Local search is handled by search-dialog.js. */

  /* ═══════════ 14. 自定义右键菜单 ═══════════ */
  const ctxMenu = $('#ctx-menu');
  if (ctxMenu) {
    let cx = 0, cy = 0;
    document.addEventListener('contextmenu', (e) => {
      if (e.shiftKey || e.target.closest('input,textarea')) return;
      e.preventDefault();
      cx = e.clientX; cy = e.clientY;
      ctxMenu.classList.add('open');
      const w = ctxMenu.offsetWidth, h = ctxMenu.offsetHeight;
      ctxMenu.style.left = Math.min(cx, innerWidth - w - 10) + 'px';
      ctxMenu.style.top = Math.min(cy, innerHeight - h - 10) + 'px';
    });
    const hide = () => ctxMenu.classList.remove('open');
    document.addEventListener('click', hide);
    addEventListener('scroll', hide, { passive: true });
    $('#ctx-top').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    $('#ctx-random').addEventListener('click', () => {
      if (typeof POSTS !== 'undefined' && POSTS.length) location.href = ROOT + POSTS[Math.random() * POSTS.length | 0].url;
    });
    $('#ctx-theme').addEventListener('click', () => toggleTheme(cx, cy));
    $('#ctx-copy').addEventListener('click', () => {
      const sel = getSelection().toString();
      if (sel) navigator.clipboard?.writeText(sel);
    });
    $('#ctx-home').addEventListener('click', () => location.href = ROOT + 'index.html');
    $('#ctx-reload').addEventListener('click', () => location.reload());
  }

  /* ═══════════ 15. 回顶环 / 阅读进度 ═══════════ */
  const backtop = $('#backtop');
  const ringC = $('#backtop .ring circle');
  const readBar = $('#read-bar');
  const CIRC = 138.2;
  const onScroll = () => {
    syncHead();
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.min(1, scrollY / max) : 0;
    backtop.classList.toggle('show', scrollY > 420);
    ringC.style.strokeDashoffset = CIRC * (1 - pct);
    if (document.body.classList.contains('post-page')) readBar.style.width = pct * 100 + '%';
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  backtop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  /* ═══════════ 16. 文章页：封面 / 目录 / 复制 / 已读 / 翻页 ═══════════ */
  const postId = document.body.dataset.post;
  if (postId && typeof POSTS !== 'undefined') {
    const i = POSTS.findIndex(p => p.id === postId);
    const p = POSTS[i];
    if (p) {
      readSet.add(p.id);
      localStore.setItem('mochi-read', JSON.stringify([...readSet]));
      const phbg = $('.ph-bg');
      if (phbg) phbg.innerHTML = coverSVG(p.cover) + phbg.innerHTML;
      const nav = $('#post-nav');
      if (nav) {
        const prev = POSTS[i + 1], next = POSTS[i - 1];
        nav.innerHTML = `
          ${prev ? `<a class="pn-card" href="${ROOT}${prev.url}"><span>« 上一篇</span><b>${esc(prev.title)}</b></a>`
                 : '<div class="pn-card empty"><span>« 上一篇</span><b>已经是最早的一篇啦</b></div>'}
          ${next ? `<a class="pn-card next" href="${ROOT}${next.url}"><span>下一篇 »</span><b>${esc(next.title)}</b></a>`
                 : '<div class="pn-card next empty"><span>下一篇 »</span><b>更新的还在锅里蒸着</b></div>'}`;
      }
    }
  }
  const body = $('.post-body');
  if (body) {
    const tocBox = $('#toc');
    const hs = $$('h2, h3', body);
    if (tocBox && hs.length) {
      hs.forEach((h, i) => {
        h.id = h.id || 'sec-' + i;
        const a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        if (h.tagName === 'H3') a.className = 'lv3';
        tocBox.appendChild(a);
      });
      const links = $$('a', tocBox);
      const spy = new IntersectionObserver((es) => {
        es.forEach(en => {
          if (en.isIntersecting)
            links.forEach(l => l.classList.toggle('on', l.hash === '#' + en.target.id));
        });
      }, { rootMargin: '-70px 0px -72% 0px' });
      hs.forEach(h => spy.observe(h));
    }
    $$('.codebox').forEach(box => {
      const headRow = $('.codebox-head', box);
      if (!headRow) return;
      const btn = document.createElement('button');
      btn.className = 'copy'; btn.textContent = '复制';
      btn.addEventListener('click', () => {
        navigator.clipboard?.writeText($('pre', box).innerText).then(() => {
          btn.textContent = '已复制 ✓';
          setTimeout(() => btn.textContent = '复制', 1600);
        });
      });
      headRow.appendChild(btn);
    });
  }

  /* ═══════════ 17. 滚动浮现 ═══════════ */
  const io = new IntersectionObserver((es) => {
    es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: .08 });
  $$('.rise').forEach(el => io.observe(el));
})();
