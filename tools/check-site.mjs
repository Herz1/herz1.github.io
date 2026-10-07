import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { atom, getContent, read, root } from './content.mjs';

const { SITE, POSTS, CATS } = getContent();
assert.equal(new Set(POSTS.map(p => p.id)).size, POSTS.length, '文章 ID 重复');
assert.equal(new Set(POSTS.map(p => p.url)).size, POSTS.length, '文章 URL 重复');
assert.equal(POSTS.length, fs.readdirSync(path.join(root, 'posts')).filter(p => p.endsWith('.html')).length);
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
POSTS.forEach((p, i) => {
  assert.match(p.id, /^[a-z0-9-]+$/);
  assert.equal(p.url, `posts/${p.id}.html`);
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${p.date}T00:00:00Z`).toISOString().slice(0, 10), p.date);
  assert(!i || POSTS[i - 1].date >= p.date, '索引必须按日期倒序');
  assert.equal(CATS[p.cat]?.name, p.catName);
  assert(Array.isArray(p.tags) && p.tags.every(t => typeof t === 'string'));
  const html = read(p.url);
  assert(html.includes(`data-post="${p.id}"`), `${p.id} 的正文 ID 不一致`);
  assert.equal(decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '').trim()), p.title);
  assert(html.includes(p.date), `${p.id} 的正文日期不一致`);
});
const pages = [...fs.readdirSync(root).filter(f => f.endsWith('.html')), ...POSTS.map(p => p.url)];
let scripts = 0, links = 0;
for (const page of pages) {
  const html = read(page);
  assert.match(html, /<html lang="zh-CN">/);
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!attrs.includes('src=')) { new vm.Script(body, { filename: page }); scripts++; }
  }
  for (const [, url] of html.matchAll(/(?:href|src)="([^"{}]+)"/g)) {
    if (!url || url.startsWith('#') || /^[a-z][\w+.-]*:/i.test(url) || url.startsWith('//')) continue;
    assert(!url.startsWith('/'), `${page}: 根绝对路径不兼容项目 Pages: ${url}`);
    const target = path.resolve(root, path.dirname(page), url.split(/[?#]/)[0]);
    assert(target.startsWith(root + path.sep) && fs.existsSync(target), `${page}: 缺失链接 ${url}`);
    links++;
  }
}
for (const name of fs.readdirSync(path.join(root, 'js'))) {
  if (name.endsWith('.js')) { new vm.Script(read(`js/${name}`), { filename: name }); scripts++; }
}
assert.equal(read('atom.xml').replace(/\r\n/g, '\n'), atom({ SITE, POSTS }));
assert.equal(SITE.bilibiliApiUrl, '', '本轮不得假设外部服务已经部署');
assert(fs.existsSync(path.join(root, '.nojekyll')));
console.log(`通过：${pages.length} 页面，${POSTS.length} 篇文章，${scripts} 个脚本，${links} 个本地链接；Atom 完全一致。`);
