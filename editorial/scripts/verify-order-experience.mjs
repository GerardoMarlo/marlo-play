// Isolated real Worker/database plus browser; no payment providers, email, or shipping calls.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer as viteServer} from 'vite';
import {chromium} from 'file:///C:/Users/viva_/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=path.resolve(import.meta.dirname,'..'), origin='http://127.0.0.1:5191';
const vite=await viteServer({root,server:{middlewareMode:true},appType:'custom'});
const {database}=await vite.ssrLoadModule('/tests/db.ts');
const {default:worker}=await vite.ssrLoadModule('/api/worker.ts');
const {db,sqlite}=database();
const env={DB:db,MODE:'local',PUBLIC_ORIGIN:origin,PAYMENTS_ENABLED:'false',EMAIL_ENABLED:'false',LABELS_ENABLED:'false'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')) {
   let body='';for await(const chunk of req)body+=chunk;
   const response=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,origin},body:req.method==='POST'?body:undefined}),env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  let file=path.resolve(root,'dist','.'+url.pathname),bytes;
  if(!file.startsWith(path.join(root,'dist')+path.sep))file=path.join(root,'dist/index.html');
  try{bytes=await readFile(file);}catch{file=path.join(root,'dist/index.html');bytes=await readFile(file);}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'})[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(e){res.writeHead(500).end(String(e));}
});
await new Promise(resolve=>server.listen(5191,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const output=path.join(root,'docs/order-verification');await mkdir(output,{recursive:true});
const results=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:900}});
 const response=await context.request.post(origin+'/api/orders',{data:{items:[{id:'demo-mesa',quantity:1}],name:'Prueba de pedido',email:'buyer@example.com',phone:'3312345678',delivery:'local',localConsent:true,terms:true,privacy:true,provider:'mercadopago',idempotencyKey:crypto.randomUUID()}});
 assert.equal(response.status(),201);const order=await response.json();assert.match(order.orderNumber,/^MG-\d{4}-\d{6}$/);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/pedido/confirmacion');await page.getByRole('heading',{name:'Estamos verificando tu pago',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'¡Tu pedido está confirmado!',exact:true}).count(),0);
 assert.equal(await page.locator('a[href*="guia="]').count(),0);
 await page.getByRole('button',{name:'Confirmado',exact:true}).click();await page.getByRole('heading',{name:'¡Tu pedido está confirmado!',exact:true}).waitFor();
 assert.equal(await page.locator('.order-reference strong').innerText(),order.orderNumber);
 await page.getByRole('link',{name:'Consultar estado de mi pedido',exact:true}).click();await page.getByRole('heading',{name:'El estado de tu pedido',exact:true}).waitFor();
 await context.clearCookies();await page.reload();await page.getByRole('heading',{name:'Rastrea tu pedido',exact:true}).waitFor();
 await page.getByLabel('Número de pedido o guía',{exact:true}).fill(order.orderNumber);await page.getByLabel('Correo electrónico',{exact:true}).fill('buyer@example.com');
 await page.getByRole('button',{name:'Rastrear mi pedido',exact:true}).click();await page.getByLabel('Código de verificación',{exact:true}).waitFor();
 const mail=sqlite.prepare("SELECT payload FROM outbox WHERE kind='order_code' ORDER BY rowid DESC LIMIT 1").get();
 await page.getByLabel('Código de verificación',{exact:true}).fill(JSON.parse(mail.payload).code);await page.getByRole('button',{name:'Verificar código',exact:true}).click();await page.getByRole('heading',{name:'El estado de tu pedido',exact:true}).waitFor();
 results.push({cookieSession:true,otpLookup:true,pendingNotConfirmed:true,paidConfirmed:true,localPickupNoFakeTracking:true});
 env.MODE='production';
 for(const width of [1440,768,390]) {
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/pedido/confirmacion');await page.locator('.order-reference').waitFor();
  assert.equal(await page.getByRole('heading',{name:'Simulación local'}).count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,`confirmation-${width}.png`),fullPage:true});
  await page.locator('.order-hero').screenshot({path:path.join(output,`reference-${width}.png`),style:'.site-header { visibility:hidden; }'});
  results.push({width,overflow:false,noProductionSimulation:true});
 }
 const row=sqlite.prepare('SELECT * FROM orders').get();const stored=JSON.parse(row.data);stored.checkout.delivery='national';
 sqlite.prepare("UPDATE orders SET data=?,tracking='TEST123456',logistics='shipped' WHERE id=?").run(JSON.stringify(stored),row.id);
 await page.reload();await page.getByRole('heading',{name:'Seguimiento de tu envío',exact:true}).waitFor();
 await page.getByText('Guía TEST123456:',{exact:false}).waitFor();
 await context.clearCookies();await page.goto(origin+'/pedido#'+row.id+':'+row.access_token);await page.getByRole('heading',{name:'Rastrea tu pedido',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hash,'');assert.equal(await page.locator('.order-reference').count(),0);
 assert.deepEqual(errors,[]);results.push({trackingLink:true,legacySecretRejected:true,noBrowserErrors:true});
 console.log(JSON.stringify({results,output},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await vite.close();sqlite.close();}
