import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { portal } from '../src/portal.mjs';
import { handlePersonal } from '../dist/personal/worker.mjs';

test('migration preserves all portal markup except its own domain identity', async () => {
  const original = portal(await readFile(new URL('../src/portal.css', import.meta.url), 'utf8'));
  const response = handlePersonal(new Request('https://my.marlo.games/'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html, original.replaceAll('https://marlo.games/', 'https://my.marlo.games/').replaceAll('MARLO.GAMES', 'MY.MARLO.GAMES'));
  for (const path of new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m => m[1]))) {
    const asset = handlePersonal(new Request('https://my.marlo.games' + path));
    assert.equal(asset.status, 200);
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
  }
  assert.ok(html.includes('https://play.marlo.games/pigeongod'));
  assert.ok(html.includes('https://play.marlo.games/prepress'));
});
test('SEO, HTTPS, HEAD and missing paths', async () => {
  assert.match(await handlePersonal(new Request('https://my.marlo.games/sitemap.xml')).text(), /<loc>https:\/\/my.marlo.games\/<\/loc>/);
  assert.match(await handlePersonal(new Request('https://my.marlo.games/robots.txt')).text(), /Sitemap: https:\/\/my.marlo.games\/sitemap.xml/);
  const redirect = handlePersonal(new Request('http://my.marlo.games/?from=old'));
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), 'https://my.marlo.games/?from=old');
  assert.equal(await handlePersonal(new Request('https://my.marlo.games/', { method: 'HEAD' })).text(), '');
  assert.equal(handlePersonal(new Request('https://my.marlo.games/missing')).status, 404);
  assert.equal(handlePersonal(new Request('https://my.marlo.games/', { method: 'POST' })).status, 405);
});
test('personal deployment cannot serve apex or games and has no service bindings', async () => {
  for (const host of ['marlo.games', 'play.marlo.games']) assert.equal(handlePersonal(new Request(`https://${host}/`)).status, 404);
  const config = JSON.parse(await readFile(new URL('../wrangler.personal.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.routes, [{ pattern: 'my.marlo.games', custom_domain: true }]);
  assert.equal(config.services, undefined);
});
