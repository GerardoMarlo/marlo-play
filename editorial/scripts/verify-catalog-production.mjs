import { chromium } from 'file:///C:/Users/viva_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const response = await page.request.get('https://marlo.games/api/catalog');
    assert.equal(response.status(), 200);
    const catalog = await response.json();
    for (const route of ['/', '/juegos', '/juegos/intercambio-navideno']) {
      assert.equal((await page.goto('https://marlo.games' + route)).status(), 200);
      const banner = page.locator('.play-marlo-promo');
      await banner.waitFor();
      assert.equal(await banner.count(), 1);
      assert.equal(await banner.locator('a').getAttribute('href'), 'https://play.marlo.games');
      await banner.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.play-marlo-promo img').naturalWidth === 512);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (route === '/') assert.equal(await page.locator('.online-sticker').getAttribute('href'), 'https://play.marlo.games');
      if (route.includes('intercambio')) {
        assert.equal(await page.locator('.product-information + .play-marlo-promo').count(), 1);
        if (width > 1000) assert.ok(await page.locator('.game-about').evaluate(el => Math.abs(el.querySelector('.eyebrow').getBoundingClientRect().x - el.querySelector('h2').getBoundingClientRect().x) < 1));
      } else {
        assert.equal(await page.locator('.catalog-row + .play-marlo-promo').count(), 1);
        const available = catalog.products.filter(p => !p.fixture && p.stock > 0 && (p.status === 'available' || p.status === 'preorder' && catalog.content.preordersEnabled));
        assert.equal(await page.locator('.catalog-actions button').count(), available.length);
      }
      checks.push({ width, route, banner: true, overflow: false });
    }
    await page.goto('https://marlo.games/juegos');
    const button = page.locator('.catalog-actions button').first();
    await page.locator('.catalog-row').first().waitFor();
    if (await button.count()) {
      await button.click();
      await page.getByRole('button', { name: 'Abrir carrito, 1 productos', exact: true }).waitFor({state: 'attached'});
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('marlo-shop-cart')).items[0].quantity), 1);
      await page.getByRole('button', {name:'Cerrar panel de carrito',exact:true}).click();
      checks.push({width, realCatalogCart: true});
    }
    await page.close();
  }
  const page = await browser.newPage();
  const www = await page.request.get('https://www.marlo.games/juegos', { maxRedirects: 0 });
  assert.equal(www.status(), 301);
  assert.equal(www.headers().location, 'https://marlo.games/juegos');
  fs.writeFileSync('docs/catalog-qa/production-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, wwwRedirect: true, ordersSubmitted: false }, null, 2));
  console.log(JSON.stringify({passed: true, checks, wwwRedirect: true, ordersSubmitted: false}));
} finally { await browser.close(); }
