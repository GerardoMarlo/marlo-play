import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const read=name=>Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.'+name,import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const sandbox=read('sandbox'),production=read('production');
const nativeFetch=globalThis.fetch;
const account=await nativeFetch('https://api.mercadopago.com/users/me',{headers:{Authorization:'Bearer '+sandbox.MP_ACCESS_TOKEN},signal:AbortSignal.timeout(20000)});
assert(account.ok && (await account.json()).tags?.includes('test_user'),'Requires verified test account');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {database}=await server.ssrLoadModule('/tests/db.ts');
 const {default:worker}=await server.ssrLoadModule('/api/worker.ts');
 const {processOutbox}=await server.ssrLoadModule('/api/emails.ts');
 const {db,sqlite}=database();
 // Isolated in-memory inventory. No production D1 writes or real products sold.
 sqlite.exec("UPDATE products SET data=json_set(data,'$.fixture',json('false'),'$.price',25900) WHERE id='demo-mesa'");
 const initialStock=sqlite.prepare("SELECT stock FROM products WHERE id='demo-mesa'").get().stock;
 const env={...sandbox,DB:db,MODE:'sandbox',PUBLIC_ORIGIN:'https://marlo.games',PAYMENTS_ENABLED:'true',MP_ENABLED:'true',EMAIL_ENABLED:'false',LABELS_ENABLED:'false',TURNSTILE_SECRET:'isolated-test'};
 // Browser CAPTCHA is a separate acceptance check, explicitly not tested here.
 globalThis.fetch=async(url,init)=>String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify'?Response.json({success:true,hostname:'marlo.games'}):nativeFetch(url,init);
 async function call(path,body,token){const r=await worker.fetch(new Request('https://marlo.games/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://marlo.games',...(token?{Cookie:token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);const data=await r.json();assert(r.ok,JSON.stringify({path,status:r.status,error:data.error}));data.cookie=r.headers.get("set-cookie")?.split(";")[0];return data;}
 for(const scenario of ['APRO','FUND','CONT']){
  const input={items:[{id:'demo-mesa',quantity:1}],name:'PRUEBA SANDBOX',email:'test@testuser.com',phone:'3312345678',delivery:'local',localConsent:true,terms:true,privacy:true,provider:'mercadopago',idempotencyKey:crypto.randomUUID(),turnstile:'isolated'};
  const order=await call('/orders',input);const duplicate=await call('/orders',input);assert.equal(order.id,duplicate.id);
  const tokenResponse=await nativeFetch('https://api.mercadopago.com/v1/card_tokens',{method:'POST',headers:{Authorization:'Bearer '+sandbox.MP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({card_number:'5474925432670366',expiration_month:11,expiration_year:2030,security_code:'123',cardholder:{name:scenario}}),signal:AbortSignal.timeout(20000)});
  assert(tokenResponse.ok,'Test token failed');const card=await tokenResponse.json();
  const payment={card:{token:card.id,payment_method_id:'master',installments:1}};
  const state=await call('/orders/'+order.id+'/payment',payment,order.cookie);
  assert.equal(state.payment,{APRO:'paid',FUND:'rejected',CONT:'pending'}[scenario]);
  if(scenario==='CONT')await call('/orders/'+order.id+'/payment',payment,order.cookie);
  console.log(JSON.stringify({scenario,state:state.payment,orderId:order.id,duplicateOrderPrevented:true,isolatedDB:true}));
 }
 assert.equal(sqlite.prepare("SELECT stock FROM products WHERE id='demo-mesa'").get().stock,initialStock-2);
 console.log(JSON.stringify({stockReservationAndRejectionRelease:true,orders:sqlite.prepare('SELECT count(*) AS n FROM orders').get().n,antiBot:'stubbed; separate browser test required'}));
 // Only send the approved flow, explicitly labelled, to the authorized test inbox.
 const outbox=sqlite.prepare("SELECT * FROM outbox WHERE id IN (SELECT id||':received' FROM orders WHERE payment='paid') OR id IN (SELECT id||':paid' FROM orders WHERE payment='paid')").all();
 sqlite.exec("UPDATE outbox SET status='preview'");
 for(const row of outbox){const payload=JSON.parse(row.payload);payload.id='PRUEBA-SANDBOX-SIN-COMPRA';delete payload.orderUrl;
  const {renderEmail}=await server.ssrLoadModule('/api/emails.ts');const rendered=renderEmail(row.kind,payload,'PRUEBA SANDBOX AUTORIZADA. No hubo compra, cobro ni entrega reales.');rendered.subject='[PRUEBA CHECKOUT] '+rendered.subject;
  sqlite.prepare("UPDATE outbox SET recipient=?,rendered=?,status='pending' WHERE id=?").run('pedidos@marlo.games',JSON.stringify(rendered),row.id);}
 await processOutbox({...env,EMAIL_ENABLED:'true',RESEND_API_KEY:production.RESEND_API_KEY,EMAIL_FROM:production.EMAIL_FROM});
 for(const row of sqlite.prepare("SELECT status,provider_id FROM outbox WHERE status<>'preview'").all()){assert.equal(row.status,'sent');console.log(JSON.stringify({outboxStatus:row.status,emailId:row.provider_id}));}
 sqlite.close();
}finally{globalThis.fetch=nativeFetch;await server.close();}
