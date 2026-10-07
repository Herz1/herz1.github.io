import fs from 'node:fs';
import path from 'node:path';
import { atom, getContent, read, root } from './content.mjs';

const expected = atom(getContent());
if (process.argv.includes('--check')) {
  if (read('atom.xml').replace(/\r\n/g, '\n') !== expected) {
    throw new Error('Atom 与 POSTS 不一致，请运行 node tools/sync-feed.mjs。');
  }
  console.log('Atom 与文章索引完全一致。');
} else {
  fs.writeFileSync(path.join(root, 'atom.xml'), expected);
  console.log('已从 POSTS 更新 atom.xml；网站仍可直接静态托管。');
}
