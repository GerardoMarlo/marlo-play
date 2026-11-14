import {chromium} from 'file:///C:/Users/viva_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:900}});
 for(const route of ['/terminos-de-compra','/aviso-de-privacidad']){
  const response=await page.goto('https://marlo.games'+route);
  await page.locator('.legal-document').waitFor();
  const text=await page.locator('.legal-document').innerText();
  if(response.status()!==200 || !text.includes('Vigente desde el 21 de octubre de 2026') || text.includes('Borrador para revisión'))throw Error('Legal publication check failed');
  console.log(JSON.stringify({route,status:response.status(),approvedVersion:true}));
 }
 const catalog=await (await page.request.get('https://marlo.games/api/catalog')).json();
 await page.goto('https://marlo.games/rastrear-pedido?guia=TEST-NOT-REGISTERED');
 await page.getByRole('heading',{name:'Rastrea tu pedido',exact:true}).waitFor();
 if(await page.getByLabel(/pedido o gu/).inputValue()!=='TEST-NOT-REGISTERED')throw Error('Guide not prefilled');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Tracking mobile overflow');
 await page.screenshot({path:'docs/ux-verification/published-tracking-390.png',fullPage:true});
 const unauth=await page.request.post('https://marlo.games/api/tracking',{headers:{Origin:'https://marlo.games'},data:{trackingNumber:'TEST-NOT-REGISTERED'}});
 if(unauth.status()!==400)throw Error('Tracking anti-bot protection missing');
 await page.goto('https://marlo.games/faq');
 await page.locator('summary').filter({hasText:'¿Cuánto cuesta el envío?'}).click();
 const faq=await page.locator('.faq-list').innerText();
 if(!faq.includes('$0 MXN')||!faq.includes('$70 MXN'))throw Error('FAQ prices not published');
 await page.locator('summary').filter({hasText:'¿Cómo puedo consultar el estado de mi pedido?'}).click();
 if(await page.getByRole('link',{name:'Rastreo de pedidos',exact:true}).getAttribute('href')!=='/rastrear-pedido')throw Error('FAQ tracking link missing');
 console.log(JSON.stringify({trackingPage:true,trackingAntiBot:true,trackingPrefill:true,faqPrices:true,faqTrackingLink:true}));
 if(catalog.content.shippingFlatRate!==7000 || catalog.paymentsEnabled!==false)throw Error('Unexpected production settings');
 const product=catalog.products.find(p=>p.status==='available'&&p.stock>0);
 if(!product)throw Error('No available product for local cart check');
 await page.evaluate(id=>localStorage.setItem('marlo-shop-cart',JSON.stringify({items:[{id,quantity:1}],time:Date.now()})),product.id);
 await page.goto('https://marlo.games/checkout');
 await page.locator('input[value="local"]').waitFor();
 if(!await page.locator('input[value="local"]').isChecked())throw Error('Local pickup not default');
 if(await page.locator('[name="localPostalCode"]').count())throw Error('Local pickup still asks for postal code');
 const recalculated=page.waitForResponse(r=>r.url().endsWith('/api/totals')&&r.request().postDataJSON()?.delivery==='national');
 await page.locator('input[value="national"]').check();
 const totals=await (await recalculated).json();
 // /totals returns merchandise totals; checkout adds the catalog's flat fee.
 // /orders independently computes the final charge after validating coverage.
 if(totals.total!==product.price)throw Error('Wrong server merchandise total: '+totals.total);
 await page.getByRole('button',{name:'Agregar dirección'}).click();
 await page.locator('.sum-total').filter({hasText:String((product.price+7000)/100)}).waitFor();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 await page.screenshot({path:'docs/ux-verification/published-checkout-390.png',fullPage:true});
 console.log(JSON.stringify({checkout:true,shipping:catalog.content.shippingFlatRate,paymentsEnabled:catalog.paymentsEnabled,submittedOrder:false}));
}finally{await browser.close();}
