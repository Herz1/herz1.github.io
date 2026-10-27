# 🍡 兔山手帖 · Usagiyama Notes

一个致敬京都动画《玉子市场》治愈风的**零依赖纯静态**个人博客。

> 日常明朗，年糕可爱。

## ✨ 特性一览

- 🏘️ **手绘 SVG 商店街全景**（六间小店 + 拱门 + 灯笼串），支持**昼/夜双场景**——夜晚会点灯、升月亮、出星星
- 🌗 日夜切换带 **View Transitions 圆形扩散动画**（不支持的浏览器自动回退）
- 🐦 看板娘「大福」：会眨眼、点击说话、**连点三下触发年糕雨彩蛋**
- 🌸 樱花飘落画布 + 点击爆花 + 开屏三色团子动画
- 🎵 **原创八音盒 BGM《商店街的午后》**：Web Audio API 现场合成，仓库里没有任何音频文件
- 🔍 全站搜索（`Ctrl + K`）、自定义右键菜单（`Shift + 右键` 回到系统菜单）
- 🏷️ 文章「未读」徽标、相对时间（"3 天前"）、热门标签计数、按月归档 —— 致敬张洪Heo / 安知鱼
- 📦 归档页时间轴 + 分类筛选、Bilibili 公开追番实时同步、友链页、关于页、404 迷路大福
- 📖 文章页：目录高亮、阅读进度条、代码块一键复制、上一篇/下一篇自动生成
- 🕐 商店街时钟（8:00–20:00 显示「营业中」，其余时间「打烊了」）
- 📱 全站响应式 + `prefers-reduced-motion` 动画减弱支持
- ⚡ **零框架、零构建、零依赖**：核心美术为手写 SVG，追番封面按需加载自 Bilibili

## 📂 目录结构

```
herz1.github.io/
├── index.html          # 首页（商店街全景）
├── archive.html        # 归档：时间轴 + 分类筛选
├── bangumi.html        # 追番页
├── friends.html        # 友链页
├── about.html          # 关于页
├── 404.html            # 404（自包含样式，任何路径下可用）
├── atom.xml            # RSS/Atom 订阅源（手动维护）
├── css/style.css       # 全站样式（昼/夜两套设计令牌）
├── js/data.js          # 站点数据：文章索引 / 台词 / 碎碎念
├── js/main.js          # 全部交互组件（悬浮组件由 JS 注入）
├── js/bangumi.js       # Bilibili 公开追番同步 / 缓存 / 筛选
├── posts/*.html        # 文章正文
├── tools/              # 本地 Python 服务与 PowerShell 管理脚本
├── 一键启动网站.cmd     # Windows 本地完整模式启动器
├── .nojekyll           # 禁用 GitHub Pages 的 Jekyll 处理
├── LICENSE             # 程序代码的 MIT 许可证
└── assets/favicon.svg  # 站点图标
```

## 🚀 本地预览

页面本身是零构建的静态网站。需要完整的 Bilibili 实时同步时，Windows 用户推荐直接双击根目录中的：

- `一键启动网站.cmd`：启动本地服务器并打开浏览器
- `一键关闭网站.cmd`：只关闭本项目启动的服务器
- `一键启动或关闭网站.cmd`：根据当前状态自动启动或关闭

默认地址为 `http://127.0.0.1:4173/`，运行状态与日志保存在自动忽略的 `.local-server/` 目录中。
追番页的 Bilibili 实时同步由这个本地 Python 服务安全转发公开数据；它不会读取账号 Cookie、密码或登录信息。

只预览静态页面可运行：

```bash
python -m http.server 4173
# 或
npx serve .
```

以上通用静态服务器可浏览页面，但不提供 Bilibili 实时同步接口。

## ☁️ 部署到 GitHub Pages

本站按 GitHub 用户主页发布，目标仓库固定为 [`Herz1/herz1.github.io`](https://github.com/Herz1/herz1.github.io)，正式地址为 [`https://herz1.github.io/`](https://herz1.github.io/)。项目为零构建纯静态网站，无需 Node.js 或构建产物。

1. 在 GitHub 新建公开仓库 `herz1.github.io`
2. 首次准备发布时关联并推送本文件夹：

```bash
git remote add origin https://github.com/Herz1/herz1.github.io.git
git push -u origin main
```

3. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch`，分支选 `main` / `(root)`，保存
4. 发布完成后访问 `https://herz1.github.io/`

GitHub Pages 只托管 HTML、CSS、JavaScript、图片和订阅源等静态文件，**不会运行** `tools/site-server.py` 或 Windows 启动器。本地 Python 代理继续保留；仓库新增的 [`worker/`](worker/README.md) 提供适用于公网的独立 Cloudflare Worker 代理，保留公开状态、封面、分页和缓存，不需要 B 站登录凭据。

按 [部署与验证说明](worker/README.md) 部署 Worker 后，运行 `node tools/configure-bilibili.mjs https://实际服务地址.workers.dev`，验证并保存 `config/bilibili.json`。也兼容 `SITE.bilibiliApiUrl` 直接配置。两者均为空时，Pages 仅显示明确标注的静态示例，不会请求不存在的 `/api/`。不要把 Cookie、API Key 或密码写入前端配置。

默认 Bilibili UID `201622770` 沿用旧博客配置。本轮真实请求返回“追番列表未公开”，需要账号所有者开放追番后才能同步真实收藏。代理约缓存 5 分钟，临时故障最多回退 24 小时内的记录，并显示数据时间。公开接口未提供观看进度时不会伪造进度。

将来绑定正式域名时，可在 **Settings → Pages → Custom domain** 配置，并按 GitHub 提示设置 DNS；确认域名后再添加对应的 `CNAME` 文件。图文版教程见站内文章[《把这个博客部署到 GitHub Pages 的完整笔记》](posts/github-pages-deploy.html)。

## ✍️ 写新文章

1. 复制 `posts/` 里任意一篇 HTML，改标题和正文
2. 在 `js/data.js` 的 `POSTS` 数组**开头**加一条记录（id / 标题 / 日期 / 分类 / 标签 / 摘要 / 封面配色）

首页卡片、归档、搜索、侧栏统计、上一篇/下一篇会全部自动更新。

## 🎨 快速自定义

| 想改什么 | 去哪里改 |
| --- | --- |
| 站名 / 昵称 / 开站日期 | `js/data.js` 的 `SITE`，以及各页 `<header>` 品牌区 |
| 主色调 | `css/style.css` 顶部的设计令牌（`--pink` 等） |
| 打字机文案 / 看板娘台词 / 碎碎念 | `js/data.js` |
| 社交链接 | `index.html` 作者卡 + 页脚（公开邮箱未配置，当前只显示 GitHub） |
| 追番账号 / 线上 API | `js/data.js` 的 `SITE.bilibiliUid` / `SITE.bilibiliApiUrl` |
| 友链内容 | `friends.html`（纯 HTML 卡片） |
| 评论区 | 在 [giscus.app](https://giscus.app) 生成脚本，替换文章页的 `.cmt-card` |

## 🙏 致谢

设计吸收了 [张洪Heo](https://blog.zhheo.com)、[安知鱼](https://blog.anheyu.com)、Shoka / Butterfly / [astro-koharu](https://github.com/cosZone/astro-koharu) 等优秀博客与主题的亮点；正文字体为 [霞鹜文楷](https://github.com/lxgw/LxgwWenKai)（OFL）。

本项目为个人粉丝向作品，页面风格致敬京都动画《玉子市场》等治愈系作品；**全部美术素材均为原创手绘 SVG**，未使用任何官方图像，与京都动画株式会社无隶属关系。

## 📄 双重许可

- **程序代码：MIT License。** 包括 HTML 页面结构、CSS、JavaScript、Python、PowerShell 与 CMD 脚本；完整条款见 [`LICENSE`](LICENSE)。
- **原创文章内容：CC BY-NC-SA 4.0。** `posts/` 中的原创文章文字（另有声明的除外）采用[署名—非商业性使用—相同方式共享 4.0 国际](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)。

MIT License 不覆盖上述原创文章内容；转载文章时请遵守 CC BY-NC-SA 4.0 的署名、非商业和相同方式共享要求。
