import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  rm
} from 'node:fs/promises';

import path from 'node:path';
import sharp from 'sharp';

import { portal } from './src/portal.mjs';

const SOURCE_ASSETS = 'assets';
const DIST_ASSETS = 'dist/assets';

// Build portal HTML
const css = await readFile('src/portal.css', 'utf8');
const html = portal(css);

// Recreate dist/assets so old files don't remain
await rm(DIST_ASSETS, {
  recursive: true,
  force: true
});

await mkdir(DIST_ASSETS, {
  recursive: true
});

await writeFile('dist/index.html', html);

// Build asset map
const assets = {};
const assetFiles = await readdir(SOURCE_ASSETS);

for (const name of assetFiles) {
  const sourcePath = path.join(SOURCE_ASSETS, name);
  const extension = path.extname(name).toLowerCase();
  const basename = path.basename(name, extension);

  let outputName;
  let outputPath;

  // Convert PNG/JPG/JPEG → WebP
  if (
    extension === '.png' ||
    extension === '.jpg' ||
    extension === '.jpeg'
  ) {
    outputName = `${basename}.webp`;
    outputPath = path.join(DIST_ASSETS, outputName);

    await sharp(sourcePath)
      .webp({
        quality: 85
      })
      .toFile(outputPath);

    console.log(`Converted ${name} → ${outputName}`);
  } else {
    // Copy WebP, SVG, ICO, etc. unchanged
    outputName = name;
    outputPath = path.join(DIST_ASSETS, outputName);

    await copyFile(sourcePath, outputPath);

    console.log(`Copied ${name}`);
  }

  // Add final generated asset to Worker asset map
  const file = await readFile(outputPath);

  assets[`/assets/${outputName}`] =
    file.toString('base64');
}

// Generate Worker constants
const generated =
  'export const HTML = ' +
  JSON.stringify(html) +
  ';\n' +
  'export const ASSETS = ' +
  JSON.stringify(assets) +
  ';\n';

await writeFile(
  'src/generated.mjs',
  generated
);

// Build Worker
const catalog = await readFile(
  'src/catalog.mjs',
  'utf8'
);

const worker = (
  await readFile(
    'src/worker.mjs',
    'utf8'
  )
).replace(/^import .*;$/gm, '');

await writeFile(
  'dist/worker.mjs',
  catalog + '\n' + generated + worker
);

console.log('');
console.log(
  `Built static portal and routing Worker with ${assetFiles.length} source assets.`
);