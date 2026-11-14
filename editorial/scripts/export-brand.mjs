import sharp from 'sharp';
import { readdir, writeFile } from 'node:fs/promises';
const dir = new URL('../public/brand/', import.meta.url);
for (const file of await readdir(dir)) {
  if (/^(marlo-(icon|logo)-|favicon\.svg)/.test(file) && file.endsWith('.svg')) await writeFile(new URL(file.replace('.svg', '.png'), dir), await sharp(new URL(file, dir).pathname.replace(/^\/([A-Z]:)/, '$1')).resize(file.includes('logo') ? 1260 : 576).png().toBuffer());
}
for (const [name, size] of [['favicon-16',16], ['favicon-32',32], ['apple-touch-icon',180], ['app-icon-512',512]]) {
  await writeFile(new URL(name+'.png', dir), await sharp(new URL('favicon.svg', dir).pathname.replace(/^\/([A-Z]:)/, '$1')).resize(size,size).png().toBuffer());
}
