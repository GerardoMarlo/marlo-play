// Loopback-only manual payment harness. Never deployed and never uses production D1.
import fs from 'node:fs';
import path from 'node:path';
import {createServer as httpServer} from 'node:http';
import {createServer as viteServer} from 'vite';
const root=path.resolve(import.meta.dirname,'..'),origin='http://127.0.0.1:5180';
const secrets=Object.fromEntries(fs.readFileSync(path.join(root,'.dev.vars.sandbox'),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const nativeFetch=globalThis.fetch;
const account=await nativeFetch('https://api.mercadopago.com/users/me',{headers:{Authorization:'Bearer '+secrets.MP_ACCESS_TOKEN},signal:AbortSignal.timeout(20000)});
if(!account.ok || !(await account.json()).tags?.includes('test_user'))throw Error('Sandbox requires a verified Mercado Pago test seller. Not started.');
if(!secrets.MP_PUBLIC_KEY || !secrets.MP_WEBHOOK_SECRET)throw Error('Sandbox Mercado Pago configuration incomplete.');
const ppCheck=await nativeFetch('https://api-m.sandbox.paypal.com/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(secrets.PAYPAL_CLIENT_ID+':'+secrets.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
if(!ppCheck.ok || !secrets.PAYPAL_WEBHOOK_ID)throw Error('PayPal sandbox configuration could not be verified.');
const vite=await viteServer({root,server:{middlewareMode:true},appType:'custom'});
const {database}=await vite.ssrLoadModule('/tests/db.ts');
const {default:worker}=await vite.ssrLoadModule('/api/worker.ts');
const {defaultContent}=await vite.ssrLoadModule('/src/content.ts');
const {db,sqlite}=database();
const product={...JSON.parse(fs.readFileSync(path.join(root,'data/intercambio-navideno.json'),'utf8')),fixture:false,archived:false,status:'available',stock:1000};
sqlite.prepare('INSERT INTO products(id,slug,data,stock) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,stock=excluded.stock').run(product.id,product.slug,JSON.stringify(product),1000);
sqlite.prepare("INSERT INTO content(id,data) VALUES('site',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").run(JSON.stringify({...defaultContent,featuredProductId:product.id,nationalEnabled:false,announcement:'Prueba de tarjetas: selecciona entrega local. No habrá entrega real.'}));
const nonce=crypto.randomUUID();
const env={DB:db,MODE:'sandbox',PUBLIC_ORIGIN:origin,PAYMENTS_ENABLED:'true',MP_ENABLED:'true',PAYPAL_ENABLED:'true',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:secrets.PAYPAL_CLIENT_ID,PAYPAL_CLIENT_SECRET:secrets.PAYPAL_CLIENT_SECRET,PAYPAL_WEBHOOK_ID:secrets.PAYPAL_WEBHOOK_ID,EMAIL_ENABLED:'false',LABELS_ENABLED:'false',TURNSTILE_SECRET:nonce,MP_ACCESS_TOKEN:secrets.MP_ACCESS_TOKEN,MP_PUBLIC_KEY:secrets.MP_PUBLIC_KEY,MP_WEBHOOK_SECRET:secrets.MP_WEBHOOK_SECRET};
// This isolated harness simulates CAPTCHA only. All payment SDK/API calls are real sandbox calls.
// The production worker/security modules are unchanged. No public listener, email, labels or cron.
globalThis.fetch=async(url,init)=>{
 if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify') {
  const params=new URLSearchParams(init?.body);
  return Response.json({success:params.get('secret')===nonce&&params.get('response')===nonce,hostname:'127.0.0.1'});
 }
 const response=await nativeFetch(url,init);
 if(process.argv.includes('--diagnose') && String(url).startsWith('https://api.mercadopago.com/') && !response.ok){
  const failure=await response.clone().json().catch(()=>({}));
  console.log(JSON.stringify({provider:'mercadopago',http:response.status,error:failure.error,errorKeys:Object.keys(failure),errors:failure.errors?.map(x=>({code:x.code,keys:Object.keys(x)}))}));
 }
 return response;
};
const server=httpServer(async(req,res)=>{
 try {
  if(req.headers.host!=='127.0.0.1:5180'){res.writeHead(403).end();return;}
  const u=new URL(req.url,origin);
  const callback=['/checkout/paypal/return','/checkout/paypal/cancel'].includes(u.pathname);
  if(u.pathname.startsWith('/api/')||callback) {
   if(!callback&&!/^\/api\/(catalog|totals|order-session|order-tracking|order-access\/(?:request|verify)|orders(?:\/[^/]+(?:\/(?:payment|capture|card-methods|refresh))?)?)$/.test(u.pathname)){res.writeHead(403,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Esta vista sandbox permite solo pruebas de tarjeta con entrega local.'}));return;}
   if(!['GET','POST'].includes(req.method)|| (req.method==='POST'&&req.headers.origin!==origin)){res.writeHead(403).end();return;}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64000){res.writeHead(413).end();return;}}
   if(u.pathname==='/api/orders'&&req.method==='POST'){
    const input=JSON.parse(raw);
    if(input.delivery!=='local'||!['mercadopago','paypal'].includes(input.provider)){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Selecciona entrega local para esta prueba.'}));return;}
    raw=JSON.stringify({...input,turnstile:nonce});
   }
   const headers=new Headers({'Content-Type':'application/json'});
   for(const name of ['origin','cookie'])if(req.headers[name])headers.set(name,req.headers[name]);
   const response=await worker.fetch(new Request(u,{method:req.method,headers,body:req.method==='POST'?raw:undefined}),env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  const dist=path.join(root,'dist');
  let filename=path.resolve(dist,'.'+decodeURIComponent(u.pathname));
  if(!filename.startsWith(dist+path.sep)){filename=path.join(dist,'index.html');}
  let bytes;try{bytes=fs.readFileSync(filename);}catch{filename=path.join(dist,'index.html');bytes=fs.readFileSync(filename);}
  res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.gif':'image/gif'})[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(bytes);
 }catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:'No se pudo completar la prueba sandbox.'}));}
});
await new Promise(resolve=>server.listen(5180,'127.0.0.1',resolve));
console.log(JSON.stringify({url:origin,testSellerVerified:true,database:'isolated in-memory; reset on restart',payments:'Mercado Pago and PayPal sandbox',shipping:false,email:false,captcha:'simulated in this loopback-only harness'}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();sqlite.close();void vite.close().then(()=>process.exit());});
