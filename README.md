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
- 📦 归档页时间轴 + 分类筛选、追番页（京阿尼作品集）、友链页、关于页、404 迷路大福
- 📖 文章页：目录高亮、阅读进度条、代码块一键复制、上一篇/下一篇自动生成
- 🕐 商店街时钟（8:00–20:00 显示「营业中」，其余时间「打烊了」）
- 📱 全站响应式 + `prefers-reduced-motion` 动画减弱支持
- ⚡ **零框架、零构建、零依赖、零图片文件**：全部美术为手写 SVG

## 📂 目录结构

```
usagiyama-blog/
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
├── posts/*.html        # 文章正文
└── assets/favicon.svg  # 站点图标
```

## 🚀 本地预览

纯静态，**双击 `index.html` 即可**，效果与线上完全一致。想要 `localhost` 地址的话：

```bash
python -m http.server 4173
# 或
npx serve .
```

## ☁️ 部署到 GitHub Pages

1. 在 GitHub 新建仓库（名字随意，如 `usagiyama-blog`）
2. 推送本文件夹：

```bash
git remote add origin https://github.com/<你的用户名>/usagiyama-blog.git
git push -u origin main
```

3. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch`，分支选 `main` / `(root)`，保存
4. 一两分钟后访问 `https://<你的用户名>.github.io/usagiyama-blog/`

全站使用相对路径，项目页 / 用户主页（`<用户名>.github.io` 仓库）/ 自定义域名（加 `CNAME` 文件）三种方式**无需改任何代码**。图文版教程见站内文章[《把这个博客部署到 GitHub Pages 的完整笔记》](posts/github-pages-deploy.html)。

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
| 社交链接（GitHub / 邮箱） | `index.html` 作者卡 + 页脚（搜 `yourname`） |
| 追番 / 友链内容 | `bangumi.html` / `friends.html`（纯 HTML 卡片） |
| 评论区 | 在 [giscus.app](https://giscus.app) 生成脚本，替换文章页的 `.cmt-card` |

## 🙏 致谢

设计吸收了 [张洪Heo](https://blog.zhheo.com)、[安知鱼](https://blog.anheyu.com)、Shoka / Butterfly / [astro-koharu](https://github.com/cosZone/astro-koharu) 等优秀博客与主题的亮点；正文字体为 [霞鹜文楷](https://github.com/lxgw/LxgwWenKai)（OFL）。

本项目为个人粉丝向作品，页面风格致敬京都动画《玉子市场》等治愈系作品；**全部美术素材均为原创手绘 SVG**，未使用任何官方图像，与京都动画株式会社无隶属关系。

## 📄 许可

- 代码：MIT
- 文章内容：CC BY-NC-SA 4.0
