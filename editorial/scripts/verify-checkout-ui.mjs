// Local UI fixtures only: no external payment, delivery or email is performed.
import {chromium} from 'file:///C:/Users/viva_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root,'src/content.ts'),'utf8');
const {defaultContent} = await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const product = {...JSON.parse(await readFile(path.join(root,'data/intercambio-navideno.json'),'utf8')), stock:20,status:'available', fixture:false};
const catalog = {products:[product], content:{...defaultContent, featuredProductId:product.id}, mode:'local', paymentsEnabled:false,providers:{mercadopago:true,paypal:true}};
let quoteCalls=0, orderCalls=0, paymentCalls=0, captureCalls=0, rejectCoverage=false;
let actualBrands=[];
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) {
      let raw=''; for await(const chunk of req)raw+=chunk;
      const b=raw?JSON.parse(raw):{};
      res.setHeader('Content-Type','application/json');
      let data;
      if(url.pathname==='/api/catalog')data=catalog;
      else if(url.pathname==='/api/tracking') {
        if(b.trackingNumber==='INVALID'){res.statusCode=404;data={error:'No pudimos localizar esta guía. Revisa el número recibido por correo.'};}
        else data={trackingNumber:b.trackingNumber,carrier:'FedEx',status:'in_transit',updatedAt:'2026-10-21T12:00:00Z',stale:false,events:[{status:'in_transit',date:'2026-10-21T12:00:00Z'},{status:'picked_up',date:'2026-10-20T12:00:00Z'},{status:'created',date:'2026-10-19T12:00:00Z'}]};
      }
      else if(url.pathname==='/api/totals')data={lines:[{id:product.id,title:product.title,quantity:1,amount:25900}],subtotal:25900,discount:0,total:25900};
      else if(url.pathname==='/api/postal')data=[{colony:'Ciudad del Sol',city:'Zapopan',state:'Jalisco'}];
      else if(url.pathname==='/api/quotes'){quoteCalls++; if(rejectCoverage){res.statusCode=409;data={error:'Lo sentimos, por ahora no contamos con cobertura de envío para esta dirección. Revisa tus datos o intenta con otra dirección.'};}else data={id:'test-quote',expires:Date.now()+900000,shipping:7000,fixture:true};}
      else if(url.pathname==='/api/orders'){orderCalls++;data={id:'MG-2026-000001',orderNumber:'MG-2026-000001',total:b.delivery==='national'?32900:25900,payment:'pending',provider:b.provider};}
      else if(url.pathname==='/api/orders/MG-2026-000001/payment'){paymentCalls++;data={providerId:'TEST-PAYPAL'};}
      else if(url.pathname==='/api/orders/MG-2026-000001/capture'){captureCalls++;data={payment:'paid'};}
      else if(url.pathname==='/api/orders/MG-2026-000001' || url.pathname==='/api/order-session')data={id:'MG-2026-000001',orderNumber:'MG-2026-000001',created:Date.now(),email:'t***@example.com',lines:[],payment:'paid',delivery:'local',total:25900};
      else if(url.pathname==='/api/orders/MG-2026-000001/card-methods')data=actualBrands;
      else {res.statusCode=404;data={error:'Unknown fixture endpoint'};}
      res.end(JSON.stringify(data));return;
    }
    const filename=path.resolve(root,'dist','.'+decodeURIComponent(url.pathname));
    if(!filename.startsWith(path.join(root,'dist')))throw Error('path');
    let data;let ext=path.extname(filename);
    try{data=await readFile(filename);}catch{data=await readFile(path.join(root,'dist/index.html'));ext='.html';}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(data);
  }catch(e){res.statusCode=500;res.end(String(e));}
});
await new Promise(resolve=>server.listen(5189,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const output=path.join(root,'docs/ux-verification');await mkdir(output,{recursive:true});
const assert=(value,msg)=>{if(!value)throw Error(msg);};
const results=[];
try{
 for(const width of process.argv.includes("--providers-only") ? [] : [1440,1280,768,390]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({id})=>{localStorage.setItem('marlo-shop-cart',JSON.stringify({items:[{id,quantity:1}],time:Date.now()}));},product);
  await page.goto('http://127.0.0.1:5189/');await page.locator('.fan-card').first().waitFor();
  if(width>1000)assert(await page.locator('.site-header nav a').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=14,'Small nav');
  const card=page.locator('.fan-card').first();await card.hover();await page.waitForTimeout(350);
  assert(await card.evaluate(el=>getComputedStyle(el).scale)==='1.04','Card hover missing');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);
  assert(await card.evaluate(el=>getComputedStyle(el).scale)==='none','Reduced motion ignored');await page.emulateMedia({reducedMotion:'no-preference'});
  await page.mouse.move(0,0);await page.screenshot({path:path.join(output,`home-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:/Abrir carrito/}).click();
  await page.waitForTimeout(400);
  assert(await page.locator('.cart-drawer').evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1),'Drawer outside viewport');
  assert(!(await page.locator('.drawer-summary').innerText()).includes('Por elegir'),'Cart shipping placeholder');
  for(const selector of ['.cart-drawer h2 span','.drawer-close']) assert(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height)<1&&getComputedStyle(el).borderRadius==='50%';}),'Cart control is not circular');
  assert(await page.locator('.drawer-total').innerText().then(t=>t.includes('259')),'Cart total');
  await page.screenshot({path:path.join(output,`cart-${width}.png`),fullPage:true});
  await page.getByRole('link',{name:'Continuar compra'}).click();
  await page.locator('input[value="local"]').waitFor();
  assert(await page.locator('input[value="local"]').isChecked(),'Local default');
  assert(await page.locator('[name="localPostalCode"]').count()===0,'Local pickup still requires postcode');
  assert(await page.locator('input[value="mercadopago"]').isChecked(),'MP default');
  assert(!(await page.locator('[name="marketingConsent"]').isChecked()),'Marketing opt in default');
  assert(!(await page.locator('.summary').innerText()).includes('Descuento'),'Zero discount visible');
  assert((await page.locator('.summary').innerText()).includes('GRATIS ENTREGA LOCAL'),'Free delivery label missing');
  await page.screenshot({path:path.join(output,`checkout-local-${width}.png`),fullPage:true});
  await page.locator('input[value="national"]').check();
  await page.getByRole('button',{name:'Agregar dirección'}).click();
  assert((await page.locator('.sum-total').innerText()).includes('329'),'Flat shipping total');
  await page.screenshot({path:path.join(output,`checkout-address-${width}.png`),fullPage:true});
  const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);assert(scroll<=width,`Overflow ${width}: ${scroll}`);
  if(width===390){
    for(const [name,value] of Object.entries({name:'Prueba UI',email:'buyer@example.com',phone:'3312345678','address-recipient':'Destinatario','address-phone':'3312345678','address-email':'recipient@example.com','address-street':'Calle','address-exterior':'1','address-postalCode':'45050'}))await page.locator(`input[name="${name}"]`).fill(value);
    await page.locator('select[name="colony"]').selectOption('Ciudad del Sol');
    await page.locator('input[name="terms"]').check();await page.locator('input[name="privacy"]').check();
    rejectCoverage=true;const before=orderCalls;await page.getByRole('button',{name:'Finalizar compra'}).click();await page.getByRole('alert').filter({hasText:'no contamos con cobertura'}).waitFor();assert(orderCalls===before,'Order created without coverage');
    rejectCoverage=false;await page.getByRole('button',{name:'Finalizar compra'}).click();await page.waitForURL('**/pedido/confirmacion');assert(orderCalls===before+1,'Order not created after validation');
  }
  await page.goto('http://127.0.0.1:5189/rastrear-pedido?guia=TEST123456');
  await page.getByRole('heading',{name:'Rastrea tu pedido',exact:true}).waitFor();
  assert(await page.locator('#tracking-number').inputValue()==='TEST123456','Guide not prefilled');
  await page.getByRole('button',{name:'Rastrear mi pedido',exact:true}).click();
  await page.locator('.tracking-result h2').waitFor();
  assert(await page.locator('.tracking-result h2').innerText()==='En tránsito','Tracking status missing');
  assert(await page.locator('.tracking-history li').count()===3,'Tracking history missing');
  assert(await page.locator('.tracking-milestones .complete').count()===2,'Unobserved milestone marked complete');
  assert(await page.locator('.site-header a[href="/rastrear-pedido"]').isVisible(),'Tracking nav hidden');
  assert(await page.locator('.site-footer a[href="/rastrear-pedido"]').count()===1,'Tracking footer missing');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tracking overflow');
  await page.screenshot({path:path.join(output,`tracking-${width}.png`),fullPage:true});
  await page.locator('#tracking-number').fill('INVALID');await page.getByRole('button',{name:'Rastrear mi pedido',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'No pudimos localizar'}).waitFor();
  assert(await page.locator('.tracking-result').count()===0,'Old shipment still shown after error');
  await page.goto('http://127.0.0.1:5189/faq');await page.locator('summary').filter({hasText:'¿Cuánto cuesta el envío?'}).click();
  assert((await page.locator('.faq-list').innerText()).includes('$70 MXN'),'FAQ shipping price missing');
  await page.locator('summary').filter({hasText:'¿Cómo puedo consultar el estado de mi pedido?'}).click();
  await page.getByRole('link',{name:'Rastreo de pedidos',exact:true}).click();await page.locator('.tracking-page').waitFor();
  assert(!errors.length,errors.join('\n'));results.push({width,overflow:false,errors,defaults:true,tracking:true,circularCartControls:true});await page.close();
 }
 const page=await browser.newPage();for(const route of ['/terminos-de-compra','/aviso-de-privacidad']){await page.goto('http://127.0.0.1:5189'+route);await page.locator('.legal-document').waitFor();assert(await page.locator('.legal-document h2').count()>10,'Incomplete legal');}
 if(process.argv.includes('--mock-inline')) {
  Object.assign(catalog,{mode:'sandbox',paymentsEnabled:true,mpPublicKey:'mock',paypalClientId:'mock'});
  for(const provider of ['mercadopago','paypal']) {
    const p=await browser.newPage({viewport:{width:390,height:950}});
    await p.route('https://sdk.mercadopago.com/js/v2',route=>route.fulfill({contentType:'application/javascript',body:
      'window.MercadoPago=class{bricks(){return {create:async(_,id)=>{document.getElementById(id).innerHTML="<form><label>Tarjeta de prueba<input name=mockCard></label></form>";return {getFormData:async()=>({token:"mock-token",payment_method_id:"master"}),unmount(){document.getElementById(id)?.replaceChildren()}}}}}};'}));
    await p.route('https://www.paypal.com/sdk/js?*',route=>route.fulfill({contentType:'application/javascript',body:
      'window.paypal={Buttons:opts=>({render:async selector=>{const b=document.createElement("button");b.textContent="Autorizar PayPal de prueba";b.onclick=async()=>{try{await opts.createOrder();await opts.onApprove()}catch(e){opts.onError(e)}};document.querySelector(selector).append(b)},close(){document.querySelector("#inline-paypal")?.replaceChildren()}})};'}));
    await p.addInitScript(({id})=>localStorage.setItem('marlo-shop-cart',JSON.stringify({items:[{id,quantity:1}],time:Date.now()})),product);
    const beforeOrders=orderCalls, beforePayments=paymentCalls;
    await p.goto('http://127.0.0.1:5189/checkout');
    await p.locator('[name="mockCard"]').waitFor();
    assert(orderCalls===beforeOrders,'Card fields created an order prematurely');
    if(provider==='paypal')await p.locator('input[value="paypal"]').check();
    await p.getByRole('button',{name:provider==='paypal'?'Autorizar PayPal de prueba':'Finalizar compra',exact:true}).click();
    await p.waitForTimeout(150);
    assert(orderCalls===beforeOrders,'Invalid checkout created an order');
    for(const [name,value] of Object.entries({name:'Prueba UI',email:'test@example.com',phone:'3312345678'}))await p.locator('input[name="'+name+'"]').fill(value);
    for(const name of ['localConsent','terms','privacy'])await p.locator('input[name="'+name+'"]').check();
    assert(await p.locator('form form').count()===0,'Nested payment forms');
    await p.getByRole('button',{name:provider==='paypal'?'Autorizar PayPal de prueba':'Finalizar compra',exact:true}).click();
    await p.waitForURL('**/pedido/confirmacion');
    assert(orderCalls===beforeOrders+1,'Order creation count');
    assert(paymentCalls===beforePayments+1,'Payment submission count');
    if(provider==='paypal')assert(captureCalls===1,'PayPal capture missing');
    results.push({provider,mockedInlineSubmission:true,invalidCheckoutBlocked:true});
    await p.close();
  }
 }
 if(process.argv.includes('--providers')) {
  const env=Object.fromEntries((await readFile(path.join(root,'.dev.vars.sandbox'),'utf8')).split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
  const methodsResponse=await fetch('https://api.mercadopago.com/v1/payment_methods',{headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN},signal:AbortSignal.timeout(20000)});
  assert(methodsResponse.ok,'Cannot verify sandbox brands');
  actualBrands=(await methodsResponse.json()).filter(m=>m.status==='active'&&['credit_card','debit_card'].includes(m.payment_type_id)&&259>=m.min_allowed_amount&&259<=m.max_allowed_amount).map(m=>({id:m.id,name:m.name,logo:m.secure_thumbnail}));
  Object.assign(catalog,{mode:'sandbox',paymentsEnabled:true,mpPublicKey:env.MP_PUBLIC_KEY,paypalClientId:env.PAYPAL_CLIENT_ID});
  for(const provider of ['mercadopago','paypal']) {
    const p=await browser.newPage({viewport:{width:390,height:950}});
    await p.addInitScript(({id})=>localStorage.setItem('marlo-shop-cart',JSON.stringify({items:[{id,quantity:1}],time:Date.now()})),product);
    await p.goto('http://127.0.0.1:5189/checkout');
    for(const [name,value] of Object.entries({name:'Prueba SDK',email:'test@example.com',phone:'3312345678'}))await p.locator(`input[name="${name}"]`).fill(value);
    for(const name of ['localConsent','terms','privacy'])await p.locator(`input[name="${name}"]`).check();
    await p.locator(`input[value="${provider}"]`).check();
    await p.locator('.inline-payment iframe').first().waitFor({timeout:60000});
    await p.waitForTimeout(2500);
    assert(await p.locator('.inline-payment iframe').count()>0,'Hosted provider fields missing');
    if(provider==='mercadopago') {
      assert(await p.locator('.card-brands img').count()===3,'Expected one logo per card brand');
      assert(await p.locator('.payment-reassurance img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)),'Broken payment logo');
      assert(await p.getByText('Pago seguro',{exact:true}).isVisible(),'Security badge missing');
      await p.locator('.payment-reassurance').screenshot({path:path.join(output,'payment-security-390.png'),style:'.site-header { visibility:hidden; }'});
    }
    await p.screenshot({path:path.join(output,`secure-${provider}-390.png`),fullPage:true});
    await p.locator(".form-card").filter({has:p.getByRole("heading",{name:"Elige cómo pagar.",exact:true})}).screenshot({path:path.join(output,`inline-${provider}-390.png`)});
    results.push({provider,realSandboxSdkMounted:true,paymentSubmitted:false});await p.close();
  }
 }
 console.log(JSON.stringify({results,quoteCalls,orderCalls,output},null,2));
}finally{await browser.close();server.close();}
