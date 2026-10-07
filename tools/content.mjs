import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = name => fs.readFileSync(path.join(root, name), 'utf8');
export function getContent() {
  return vm.runInNewContext(`${read('js/data.js')}\n({SITE, POSTS, CATS})`, {});
}
const xml = value => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

export function atom({ SITE, POSTS }) {
  const base = new URL(SITE.url);
  if (base.protocol !== 'https:' || !base.pathname.endsWith('/')) {
    throw new Error('SITE.url 必须是以 / 结尾的 HTTPS 根地址。');
  }
  const stamp = date => `${date}T00:00:00+08:00`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/sync-feed.mjs 从 js/data.js 生成；请勿手动编辑。 -->
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xml(SITE.name)}</title>
  <subtitle>${xml(SITE.subtitle)}</subtitle>
  <link href="${xml(base.href)}"/>
  <link rel="self" href="${xml(new URL('atom.xml', base).href)}"/>
  <id>tag:usagiyama-blog,2026:site</id>
  <updated>${stamp(POSTS[0].date)}</updated>
  <author><name>${xml(SITE.author)}</name></author>
${POSTS.map(p => `  <entry>
    <title>${xml(p.title)}</title>
    <link href="${xml(new URL(p.url, base).href)}"/>
    <id>tag:usagiyama-blog,2026:${xml(p.id)}</id>
    <updated>${stamp(p.date)}</updated>
    <summary>${xml(p.excerpt)}</summary>
  </entry>`).join('\n')}
</feed>
`;
}
