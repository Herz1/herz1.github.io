// Run with an existing Playwright Page: await verifyBangumi(page, baseURL).
// All success data in this test is a fixture, never a real user's collection.
const assert = {
  equal(a, b) { if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  ok(value) { if (!value) throw new Error('Assertion failed'); },
  match(value, pattern) { if (!pattern.test(value)) throw new Error(`Expected ${pattern}, got ${value}`); },
  deepEqual(a, b) { this.equal(JSON.stringify(a), JSON.stringify(b)); },
};

export async function verifyBangumi(page, baseURL = 'http://127.0.0.1:4173', screenshotDirectory = '') {
  const checks = [];
  const errors = [];
  const fixture = (id, extra = {}) => ({ season_id: id, title: `测试番剧 ${id}`, follow_status: 2, total_count: 12, progress: '看到第3话', cover: 'https://i0.hdslb.com/fixture.jpg', url: `https://www.bilibili.com/bangumi/play/ss${id}`, publish: { release_date: '2026-01-01' }, ...extra });
  let mode = 'normal';
  let hold;
  let requested = [];
  const data = (list, total, meta = {}) => ({ code: 0, data: { list, total }, meta: { fetchedAt: new Date().toISOString(), ...meta } });
  const api = 'https://bangumi-test.example/api/bilibili/follows';
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/config/bilibili.json', route => route.fulfill({ json: { apiUrl: api } }));
  await page.route('https://i0.hdslb.com/**', route => route.abort());
  await page.route('https://bangumi-test.example/**', async route => {
    const query = Object.fromEntries(route.request().url().split('?')[1].split('&').map(part => part.split('=').map(decodeURIComponent)));
    requested.push(query);
    const uid = query.uid;
    const status = Number(query.follow_status);
    const pn = Number(query.page);
    const headers = { 'Access-Control-Allow-Origin': baseURL };
    if (mode === 'offline') return route.abort();
    if (mode === 'privacy') return route.fulfill({ status: 403, headers, json: { code: 53013, message: '该账号的追番列表未公开。' } });
    if (mode === 'hold' && uid === '201622770') return new Promise(resolve => { hold = async () => { try { await route.fulfill({ headers, json: data([fixture(99999, { title: '过期账号请求' })], 1) }); } finally { resolve(); } }; });
    if (mode === 'empty') return route.fulfill({ headers, json: data([], 0) });
    if (mode === 'stale') return route.fulfill({ headers, json: data([fixture(1)], 1, { stale: true, fetchedAt: new Date(Date.now() - 3600000).toISOString() }) });
    if (mode === 'hostile') return route.fulfill({ headers, json: data([fixture(1, { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', cover: 'https://evil.test/tracker.jpg', styles: ['<svg onload=alert(2)>'] })], 1) });
    if (mode === 'repeat') return route.fulfill({ headers, json: data(Array.from({ length: 24 }, (_, n) => fixture(n + 1)), 100) });
    if (status) return route.fulfill({ headers, json: data([fixture(status + 100, { follow_status: status })], 1) });
    return route.fulfill({ headers, json: data(pn === 1 ? Array.from({ length: 24 }, (_, n) => fixture(n + 1)) : [fixture(24), fixture(25)], 25) });
  });
  const text = () => page.locator('#bili-notice').innerText();
  const wait = () => page.waitForFunction(() => document.querySelector('#bangumi-grid').getAttribute('aria-busy') === 'false' && /同步完成|旧缓存|同步失败|没有读取到/.test(document.querySelector('#bili-notice').textContent));
  const fresh = async () => { await page.goto(baseURL + '/bangumi.html'); await wait(); };
  await fresh();
  assert.equal(await page.locator('.bangumi-live-card').count(), 24);
  assert.match(await page.locator('.bili-progress-text').first().innerText(), /第3话/);
  assert.equal(await page.locator('.bangumi-live-card .bgm-prog i').first().getAttribute('style'), 'width:25%');
  assert.equal(requested[0].uid, '201622770');
  await page.locator('#bili-load-more').click(); await wait();
  assert.equal(await page.locator('.bangumi-live-card').count(), 25);
  assert.equal(await page.locator('#bili-load-wrap').isVisible(), false);
  checks.push('默认 UID、卡片、公开进度、分页与重复项去重');
  await page.locator('[data-follow-status="3"]').click(); await wait();
  assert.match(await page.locator('.bgm-state').first().innerText(), /看完/);
  assert.equal(await page.locator('[data-follow-status="3"]').getAttribute('aria-pressed'), 'true');
  checks.push('状态筛选与可访问性状态');
  await page.locator('[data-follow-status="0"]').click(); await wait();
  mode = 'offline'; await page.locator('#bili-refresh').click(); await wait();
  assert.match(await text(), /保留.*缓存/);
  assert.equal(await page.locator('.bangumi-live-card').count(), 24);
  checks.push('网络失败保留最近记录并提示缓存时间');
  mode = 'empty'; await page.locator('#bili-refresh').click(); await wait();
  assert.equal(await page.locator('.bangumi-live-card').count(), 0);
  assert.equal(await page.locator('.bili-empty').isVisible(), true);
  assert.equal(await page.locator('.bgm-static').isVisible(), false);
  mode = 'offline'; await fresh();
  assert.equal(await page.locator('.bili-empty').isVisible(), true);
  checks.push('空列表会替换旧数据且能恢复空缓存');
  mode = 'stale'; await page.locator('#bili-refresh').click(); await wait();
  assert.match(await text(), /旧缓存/);
  assert.equal(await page.locator('#bili-notice').getAttribute('data-tone'), 'warn');
  checks.push('服务端过期缓存不会显示为新同步');
  mode = 'repeat'; await page.locator('#bili-refresh').click(); await wait();
  await page.locator('#bili-load-more').click(); await wait();
  assert.equal(await page.locator('#bili-load-wrap').isVisible(), false);
  checks.push('重复分页会停止加载，避免无限请求');
  mode = 'hostile'; await page.locator('#bili-refresh').click(); await wait();
  assert.equal(await page.locator('.bangumi-live-card h2 img').count(), 0);
  assert.ok((await page.locator('.bili-card-link').getAttribute('href')).startsWith('https://www.bilibili.com/'));
  assert.equal(await page.locator('.bili-cover-image').count(), 0);
  checks.push('外部文本转义及链接、封面域名限制');
  mode = 'hold'; await page.locator('#bili-refresh').click();
  await page.waitForFunction(() => document.querySelector('#bangumi-grid').getAttribute('aria-busy') === 'true');
  // Route dispatch is asynchronous; wait briefly for the held request to arrive.
  for (let i = 0; !hold && i < 40; i++) await page.waitForTimeout(25);
  assert.ok(hold);
  await page.locator('#bili-settings').click();
  await page.locator('#bili-uid').fill('123');
  await page.locator('#bili-setup button[type="submit"]').click(); await wait();
  await hold();
  assert.match(await page.locator('#bili-sync-title').innerText(), /123/);
  assert.equal(await page.getByText('过期账号请求', { exact: true }).count(), 0);
  checks.push('切换账号时取消旧请求，防止串号与错误缓存');
  mode = 'normal';
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#bili-refresh').click(); await wait();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('#mascot').count(), 1);
  await page.locator('#mascot').click();
  assert.ok(await page.locator('#mascot').isVisible());
  if (screenshotDirectory) await page.screenshot({ path: screenshotDirectory + '/bangumi-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  if (screenshotDirectory) await page.screenshot({ path: screenshotDirectory + '/bangumi-desktop.png', fullPage: true });
  checks.push('375px 移动端无横向溢出、复用唯一大福组件');
  await page.evaluate(() => localStorage.clear());
  mode = 'privacy'; await fresh();
  assert.match(await text(), /未公开.*静态示例/);
  assert.equal(await page.locator('.bgm-static').isVisible(), true);
  checks.push('私密列表清楚提示，静态卡片不冒充真实收藏');
  assert.deepEqual(errors, []);
  return { passed: checks.length, checks, pageErrors: errors, note: '成功列表来自测试夹具；真实 UID 201622770 单独核验为 53013 未公开。' };
}
