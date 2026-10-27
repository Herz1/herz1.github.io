// Verify a deployed Worker before writing its public URL into the static site.
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const value = args.find(arg => !arg.startsWith('--'));
if (!value) throw new Error('用法：node tools/configure-bilibili.mjs https://你的服务.workers.dev [--check-only]');
const base = new URL(value);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['/', '/api/bilibili/follows'].includes(base.pathname)) {
  throw new Error('请输入不含凭据、查询参数的 HTTPS Worker 地址。');
}
const endpoint = new URL('/api/bilibili/follows', base);
const origin = 'https://herz1.github.io';
const get = async (url, init = {}) => fetch(url, { ...init, headers: { Origin: origin, ...init.headers }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
const checkCors = response => {
  if (response.headers.get('access-control-allow-origin') !== origin) throw new Error('跨域检查失败：Worker 未允许正式博客来源。');
};
const health = await get(new URL('/healthz', base));
checkCors(health);
const healthData = await health.json();
if (!health.ok || healthData.service !== 'usagiyama-bangumi-api' || healthData.code !== 0) throw new Error('Worker 健康检查失败。');
const options = await get(endpoint, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'accept' } });
checkCors(options);
if (options.status !== 204) throw new Error('跨域预检失败。');
const probe = new URL(endpoint);
probe.search = 'uid=201622770&page=1&page_size=1&follow_status=0';
const response = await get(probe);
checkCors(response);
const body = await response.json();
if (body.code === 53013 && response.status === 403) {
  console.warn('代理已响应，但 UID 201622770 的追番未公开；请在 B 站开放后再次检查。');
} else if (!response.ok || body.code !== 0 || !Array.isArray(body.data?.list)) {
  throw new Error(`追番检查失败：${body.message || response.status}`);
} else {
  console.log(`公开追番检查通过，共 ${body.data.total} 部；缓存状态 ${body.meta?.cache || 'unknown'}。`);
}
if (!args.includes('--check-only')) {
  await writeFile(new URL('../config/bilibili.json', import.meta.url), JSON.stringify({ apiUrl: endpoint.href }, null, 2) + '\n');
  console.log('已写入 config/bilibili.json。请审阅变更后发布博客。');
} else console.log('检查通过，未修改配置。');
