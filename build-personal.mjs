import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { portal } from './src/portal.mjs';

// Independent output: never rebuild or deploy the game gateway for this site.
const output = new URL('./dist/personal/', import.meta.url);
await mkdir(output, { recursive: true });
const html = portal(await readFile(new URL('./src/portal.css', import.meta.url), 'utf8'))
  .replaceAll('https://marlo.games/', 'https://my.marlo.games/')
  .replaceAll('MARLO.GAMES', 'MY.MARLO.GAMES');
const assets = {};
const directory = new URL('./assets/', import.meta.url);
for (const name of (await readdir(directory)).sort()) {
  const input = await readFile(new URL(name, directory));
  const convert = /\.(png|jpe?g)$/i.test(name);
  const outputName = convert ? name.replace(/\.(png|jpe?g)$/i, '.webp') : name;
  assets['/assets/' + outputName] = (convert ? await sharp(input).webp({ quality: 85 }).toBuffer() : input).toString('base64');
}
const worker = await readFile(new URL('./src/personal-worker.mjs', import.meta.url), 'utf8');
await writeFile(new URL('worker.mjs', output), `const HTML=${JSON.stringify(html)};\nconst ASSETS=${JSON.stringify(assets)};\n${worker}`);
console.log('Built independent personal portal: dist/personal/worker.mjs');
