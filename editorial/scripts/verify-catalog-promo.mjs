import { chromium } from 'file:///C:/Users/viva_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = JSON.parse(fs.readFileSync('data/intercambio-navideno.json','utf8'));
const products=[{...base,status:'available',stock:3,weight:1,length:1,width:1,height:1}, {...base,id:'future-game',slug:'future-game',title:'Juego futuro',status:'coming_soon',stock:0}, {...base,id:'sold-game',slug:'sold-game',title:'Juego agotado',status:'sold_out',stock:0}];
const browser=await chromium.launch({channel:'msedge',headless:true});
const output='docs/catalog-qa/run-'+Date.now();fs.mkdirSync(output,{recursive:true});
const results=[];
try {
 for(const width of [320,390,768,1440]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/catalog',r=>r.fulfill({json:{products,content:{headline:'Marlo',preordersEnabled:false,shippingFlatRate:7000,localEnabled:true,nationalEnabled:true},mode:'local',paymentsEnabled:false}}));
  for(const route of ['/','/juegos','/juegos/intercambio-navideno']) {
   await page.goto('http://127.0.0.1:5173'+route);
   await page.locator('.play-marlo-promo').waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.play-marlo-promo').count(),1);
   assert.equal(await page.locator('.play-marlo-promo a').getAttribute('href'),'https://play.marlo.games');
   await page.locator('.play-marlo-promo img').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('.play-marlo-promo img').naturalWidth===512);
   if(route==='/') await page.locator('.play-marlo-promo').screenshot({path:`${output}/${width}-banner.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width} ${route}`);
   if(route==='/')assert.equal(await page.locator('.online-sticker').getAttribute('href'),'https://play.marlo.games');
   if(route.includes('intercambio')) {
    const aligned=await page.locator('.game-about').evaluate(el=>{const a=el.querySelector('.eyebrow').getBoundingClientRect(),b=el.querySelector('h2').getBoundingClientRect();return Math.abs(a.x-b.x)<1});
    if(width>1000) assert.ok(aligned);
    assert.equal(await page.locator('.product-information + .play-marlo-promo').count(),1);
    if(width<=700){
     const metrics=()=>{const el=document.querySelector('.game-about');return [el,...el.querySelectorAll('*')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return [r.x,r.width,r.height,s.fontSize,s.margin,s.padding,s.textAlign]})};
     const before=await page.evaluate(metrics);
     await page.evaluate(()=>{for(const s of document.styleSheets){try{for(let i=s.cssRules.length-1;i>=0;i--){if(s.cssRules[i].cssText.includes('.storefront .game-theme .game-about'))s.deleteRule(i)}}catch{}}});
     assert.deepEqual(await page.evaluate(metrics),before,'Mobile about unchanged with desktop override removed');
    }
   } else {
    assert.equal(await page.locator('.catalog-row + .play-marlo-promo + .catalog-row').count(),1);
    assert.equal(await page.locator('.catalog-actions button').count(),1);
    const button=page.locator('.catalog-actions button');assert.ok((await button.boundingBox()).height>=44);
    await button.evaluate(el=>{el.click();el.click()});
    await page.getByRole('button',{name:'Abrir carrito, 1 productos',exact:true}).waitFor({state:'attached'});
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('marlo-shop-cart')).items),[{id:base.id,quantity:1}]);
    assert.ok(await page.locator('[role=status].toast').isVisible());
    await page.getByRole('button',{name:'Cerrar panel de carrito',exact:true}).click();
    assert.equal(await page.locator('.catalog-actions a').first().getAttribute('href'),'/juegos/'+base.slug);
    await page.evaluate(()=>{localStorage.removeItem('marlo-shop-cart');sessionStorage.clear()});
   }
   await page.screenshot({path:`${output}/${width}-${route==='/'?'home':route==='/juegos'?'catalog':'product'}.png`,fullPage:true});
   results.push({width,route,overflow:false,banner:true});
  }
  await page.goto('http://127.0.0.1:5173/juegos');await page.locator('.catalog-row').first().waitFor();
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.getByRole('button',{name:'Volver arriba'}).click();
  await page.waitForFunction(()=>scrollY<10);
  assert.equal(await page.locator('.site-header').evaluate(e=>getComputedStyle(e).position),'sticky');
  assert.deepEqual(errors,[]);
  await page.close();
 }
 const page=await browser.newPage();
 for(const scenario of [{products:[],preordersEnabled:false,count:0},{products:[{...products[0],status:'preorder'}],preordersEnabled:false,count:0},{products:[{...products[0],status:'preorder'}],preordersEnabled:true,count:1},{products:[{...products[0],stock:0}],preordersEnabled:false,count:0}]){
  await page.route('**/api/catalog',r=>r.fulfill({json:{...scenario,content:{preordersEnabled:scenario.preordersEnabled},mode:'local'}}));
  await page.goto('http://127.0.0.1:5173/juegos');await page.waitForFunction(()=>!document.body.innerText.includes('Cargando catálogo'));
  assert.equal(await page.locator('.catalog-actions button').count(),scenario.count);
  await page.unroute('**/api/catalog');
 }
 await page.route('**/api/catalog',r=>r.fulfill({json:{products,content:{preordersEnabled:false,localEnabled:true,nationalEnabled:true,shippingFlatRate:7000},mode:'local',paymentsEnabled:false}}));
 await page.goto('http://127.0.0.1:5173/juegos');
 await page.locator('.catalog-actions button').click();
 await page.locator('.cart-drawer a[href="/checkout"]').click();
 await page.locator('#checkout-form').waitFor({state:'attached'});
 assert.equal(new URL(page.url()).pathname,'/checkout');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('marlo-shop-cart')).items),[{id:base.id,quantity:1}]);
 fs.writeFileSync(output+'/results.json',JSON.stringify({results,cart:'shared state, header, localStorage and feedback verified with mocked catalog',availability:'empty, unavailable, zero stock and preorder flag verified',mobileAbout:'identical computed metrics with and without desktop override',navigation:'sticky header and back to top verified'},null,2));
 console.log('PASS: 12 responsive route checks; cart, availability, mobile preservation, navigation.');
} finally {await browser.close()}

