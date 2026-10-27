/* ============================================================
   兔山手帖 · 站点数据
   新增文章：在 posts/ 复制一篇 HTML 修改内容，再往 POSTS 开头插一条即可。
   cover: { m: 图案(street/bird/window/torii/seasons/rocket), a/b: 渐变色 }
   ============================================================ */

const SITE = {
  name: '兔山手帖',
  since: '2026-07-01',        // 开站日 → 「已运行 N 天」
  author: '麻薯',
  words: '10.2k',             // 全站字数（手动维护）
  bilibiliUid: '201622770',    // 沿用旧 Hugo 博客的公开 Bilibili 空间 UID
  bilibiliApiUrl: '',         // 优先使用此完整地址，否则读取 config/bilibili.json
};

const POSTS = [
  {
    id: 'github-pages-deploy',
    title: '把这个博客部署到 GitHub Pages 的完整笔记',
    url: 'posts/github-pages-deploy.html',
    date: '2026-07-26',
    cat: 'tech', catName: '技术手记',
    tags: ['GitHub Pages', '部署'],
    mins: 6,
    top: true,
    excerpt: '从本地文件夹到能用域名访问的网站，只需要一个仓库和三条命令。记录全部步骤、踩坑，以及绑定自定义域名的做法。',
    cover: { m: 'rocket', a: '#B7A6E8', b: '#F8AFC5' },
  },
  {
    id: 'css-mochi-bird',
    title: '用纯 SVG 画一只圆滚滚的年糕鸟',
    url: 'posts/css-mochi-bird.html',
    date: '2026-07-24',
    cat: 'tech', catName: '技术手记',
    tags: ['SVG', 'CSS 动画'],
    mins: 8,
    excerpt: '本站看板娘「大福」的诞生记：几个圆、两条弧线和一点点缓动函数，就能捏出一只会眨眼、会歪头的胖鸟。附完整源码。',
    cover: { m: 'bird', a: '#FFE3B3', b: '#FFB7A0' },
  },
  {
    id: 'kyoani-healing',
    title: '为什么京阿尼的日常如此治愈：从《玉子市场》说起',
    url: 'posts/kyoani-healing.html',
    date: '2026-07-20',
    cat: 'anime', catName: '追番观察',
    tags: ['京阿尼', '玉子市场'],
    mins: 9,
    excerpt: '光影、运镜，以及「什么都没发生」的勇气——聊聊京都动画如何把一条普通商店街拍出体温。',
    cover: { m: 'window', a: '#FFD9A0', b: '#F49BB0' },
  },
  {
    id: 'kyoto-pilgrimage',
    title: '京都圣地巡礼手账：出町柳、鸭川与商店街',
    url: 'posts/kyoto-pilgrimage.html',
    date: '2026-07-15',
    cat: 'trip', catName: '圣地巡礼',
    tags: ['京都', '巡礼路线'],
    mins: 7,
    excerpt: '《玉子市场》兔山商店街的原型就在出町柳。这份手账记录路线、能跳乌龟石的鸭川三角洲，和一家真的在卖豆大福的和菓子店。',
    cover: { m: 'torii', a: '#A8D8E8', b: '#F8C8A0' },
  },
  {
    id: 'four-seasons-street',
    title: '商店街的四季：一份生活切片',
    url: 'posts/four-seasons-street.html',
    date: '2026-07-08',
    cat: 'life', catName: '生活切片',
    tags: ['随笔', '四季'],
    mins: 5,
    excerpt: '春天的樱饼、夏天的风铃、秋天的烤团子、冬天的灯串。把一年里在街上捡到的小确幸摊开来晒一晒。',
    cover: { m: 'seasons', a: '#C8E6C0', b: '#FFD9E8' },
  },
  {
    id: 'hello-usagiyama',
    title: '你好，兔山商店街：本站开张记',
    url: 'posts/hello-usagiyama.html',
    date: '2026-07-01',
    cat: 'tech', catName: '技术手记',
    tags: ['建站', '关于本站'],
    mins: 5,
    excerpt: '零框架、零构建、零依赖——用最朴素的 HTML/CSS/JS 开一家自己的小店。开张第一天，麻薯免费。',
    cover: { m: 'street', a: '#FFDFC0', b: '#F8AFC5' },
  },
];

/* 分类信息（磁贴与徽标配色） */
const CATS = {
  tech:  { name: '技术手记', c: '#7FA0D8', icon: 'code' },
  anime: { name: '追番观察', c: '#F07E9C', icon: 'tv' },
  trip:  { name: '圣地巡礼', c: '#E8A25A', icon: 'map' },
  life:  { name: '生活切片', c: '#7FA96B', icon: 'leaf' },
};

/* 首页打字机 */
const TYPING = [
  '欢迎光临，今天也是适合吃年糕的一天。',
  '把喜欢的事情，慢慢做成生活。',
  '商店街的灯，会为晚归的人亮着。',
  '恋爱的花，也会在豆大福里发芽吗？',
];

/* 看板娘「大福」台词 */
const QUOTES = [
  '欢迎来到兔山商店街！',
  '今天的年糕也很好吃哦。',
  '要不要去「追番」页逛逛？',
  '深夜写代码，记得开台灯。',
  '偷偷告诉你：连点我三下有惊喜。',
  '天冷了，来碗年糕红豆汤吧。',
  '按 Ctrl + K 可以搜索全站哦。',
  '慢慢来，比较快。',
];

/* 说说 / 碎碎念（英雄区轮播条 + 侧栏卡） */
const MOMENTS = [
  { t: '07-26', s: '博客正式开张，撒花！部署笔记已同步发布 🎉' },
  { t: '07-24', s: '给看板娘大福加上了眨眼动画，更圆了。' },
  { t: '07-20', s: '重温《玉子爱情故事》，桥上那幕还是会心颤。' },
  { t: '07-15', s: '整理完京都巡礼的照片，想再去跳一次乌龟石。' },
  { t: '07-08', s: '夏天了，把风铃挂到了阳台上 🎐' },
];
