# Bilibili 公开追番代理

博客继续部署在 GitHub Pages；这个独立 Cloudflare Worker 只转发公开追番 JSON。无需 B 站 Cookie、密码、登录令牌或 KV 数据库。Cloudflare 部署仍需要站主自己的账号权限。

## 部署

使用 Node.js 22 或更新版本，在本目录执行：

```sh
npm ci
npm test
npm run check
npx wrangler login
npm run deploy
```

`wrangler login` 由站主在官方登录页完成，不要把 Cloudflare 令牌写进仓库或聊天。首次部署需要启用账号的 `workers.dev` 子域。保存命令返回的实际 HTTPS 地址；不要猜测账号子域。`wrangler.jsonc` 已设定正式博客来源 `https://herz1.github.io`，如以后改用自定义域名，需要把准确的 origin 加入 `ALLOWED_ORIGINS`（逗号分隔，无路径、无末尾斜线），重新部署。

两个限流 namespace ID 由本项目固定指定，如同一 Cloudflare 账号已使用这些 ID，请换成该账号中未使用的正整数。限流是每个 Cloudflare 位置的近似限制，不能当成全局费用上限。

部署后，在**仓库根目录**运行：

```sh
node tools/configure-bilibili.mjs https://实际服务地址.workers.dev
```

脚本验证健康检查、GitHub Pages 来源的 GET / OPTIONS 跨域响应和真实公开接口，再写入 `config/bilibili.json`。如果该账号未公开追番，脚本会明确警告，但允许保存已验证能响应的代理地址。审阅配置变更后随博客发布。`--check-only` 只验证、不写入。

现有 `SITE.bilibiliApiUrl` 优先级最高；推荐保持为空，使用上述独立 JSON 配置。默认账号 `201622770` 沿用旧博客的公开空间链接；可以在 `js/data.js` 修改，或使用页面访客绑定 / `?uid=` 临时查看其他公开账号。无需把 UID 放进 Worker 环境变量。

## 本地与验收

```sh
npm run dev
```

开发环境只额外允许 `http://localhost:4173` 和 `http://127.0.0.1:4173`。临时把本地 `config/bilibili.json` 的 `apiUrl` 改为 `http://127.0.0.1:8787/api/bilibili/follows`，然后在仓库根目录 `python -m http.server 4173`；不要将本地地址提交到正式配置。原有 Python 本地代理仍然可用。生产 HTTPS 页面拒绝 HTTP API。

验收检查：

- `/healthz` 返回 `code: 0`，仅表示代理存活，不代表上游可以访问。
- `/api/bilibili/follows?uid=公开UID&page=1&page_size=24&follow_status=0` 返回真实列表；从博客页面查看四种状态与加载更多。
- `follow_status` 为 0 全部、1 想看、2 在看、3 看完；page 为 1–10000，page_size 为 1–30。
- GET 和错误响应都应具有准确的 `Access-Control-Allow-Origin`。不使用 `*`、不接受带凭据的跨域请求；CORS 不是身份认证，非浏览器客户端仍可调用公开接口。
- 检查移动端 375px、封面失败、空列表、网络离线、账号快速切换。缓存命中与回退会显示真实数据时间。
- `tests/bangumi-browser.mjs` 导出 `verifyBangumi(page, baseURL)`，可在 Playwright 的独立测试页面运行；内部会模拟上游响应并清理测试页面的 localStorage，不要在日常浏览器配置中运行。

## 缓存与接口限制

Worker 只请求固定的 `api.bilibili.com/x/space/bangumi/follow/list`，不接收目标 URL，不转发浏览器 Cookie 或 Authorization，也不跟随上游重定向。UID 用字符串传递，避免大整数精度丢失。请求 10 秒超时、JSON 响应限制 2 MiB；访客端 15 秒超时。

成功结果按 UID / 状态 / 页码 / 页大小缓存 5 分钟。临时网络错误、风险控制或限流时可返回 24 小时内的最后成功结果，标记 `meta.stale: true`，并保持原始 `fetchedAt`。浏览器也按服务地址与同样的查询维度保存最近列表，最多恢复 24 小时。错误会进入 60 秒冷却期，避免反复请求上游。缓存是尽力而为，不保证跨数据中心命中或永久保留。

已核验的 `53013` 表示追番未公开，返回 HTTP 403 和可读提示，不冒充空列表或实时同步。Worker 不对明确的权限拒绝回退旧列表；浏览器若已缓存数据，失败提示会说明仍显示的是旧记录。公开接口未提供个人观看进度时显示“未提供公开观看进度”，不会索要 Cookie 或推测进度。

`-352`、`-412`、`-509` 或 HTTP 403/412/429 可能是 B 站风控。Worker 部署地区和出口也可能被限制；本地请求成功不保证 Cloudflare 出口成功。需要在实际部署地址再验证。如长期受限，应保留明确失败提示与旧缓存，等待上游恢复或自行选择可用的后端托管；不要用共享 Cookie 或来源不明的代理绕过。

封面直接使用 HTTPS `hdslb.com`、`referrerpolicy=no-referrer` 和懒加载；缩略图失败尝试原图，再回退到原有渐变背景。没有开放图片代理。

## 本轮验证（2026-10-27）

- 代理自动化测试通过；浏览器分页、筛选、缓存、空结果、失败回退、注入防护、并发切换和移动端测试通过。
- Wrangler 4.153.0 本地 `deploy --dry-run` 通过，锁定依赖在 package-lock.json。
- 真实匿名访问 UID 201622770 返回 `53013 用户隐私设置未公开`，经代理返回 HTTP 403、准确的 Pages CORS 头和中文原因。
- 另以公开测试 UID 2 做真实匿名联调：列表共 122 部，页面首屏载入 24 部、第二页累计 48 部，前三张封面成功加载，状态筛选正常。测试账号不会写入默认配置，截图不代表站主收藏。
- 本地 workerd 的健康检查 / OPTIONS / 来源拒绝通过；直连上游受本机网络环境影响返回可读 502。真实数据联调使用同一 handler 的 Node 本地预览和本机网络代理，不能代替 Cloudflare 公网出口验证。
- 当前工作环境的 `wrangler whoami` 为未登录，未进行公网部署，也未填写虚构地址。公网验证需要站主登录 Cloudflare，并将追番设为公开。

参考：[Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)、[Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)、[Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)。
