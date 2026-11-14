import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const receipt=new URL('../.wrangler/order-code-delivery-2026-10-22.json',import.meta.url);
const e=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.production',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));
if(fs.existsSync(receipt)){console.log(fs.readFileSync(receipt,'utf8'));process.exit(0);}
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
 const {database}=await vite.ssrLoadModule('/tests/db.ts');
 const {default:worker}=await vite.ssrLoadModule('/api/worker.ts');
 const {processOutbox,renderEmail}=await vite.ssrLoadModule('/api/emails.ts');
 const {db,sqlite}=database();
 const env={...e,DB:db,MODE:'local',PUBLIC_ORIGIN:'http://localhost',PAYMENTS_ENABLED:'false',EMAIL_ENABLED:'false',LABELS_ENABLED:'false'};
 const call=(path,body)=>worker.fetch(new Request(env.PUBLIC_ORIGIN+'/api'+path,{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN},body:JSON.stringify(body)}),env);
 const created=await call('/orders',{items:[{id:'demo-mesa',quantity:1}],name:'PRUEBA TECNICA',email:'pedidos@marlo.games',phone:'3312345678',delivery:'local',localConsent:true,terms:true,privacy:true,provider:'mercadopago',idempotencyKey:crypto.randomUUID()});
 assert.equal(created.status,201); const order=await created.json();
 sqlite.exec("UPDATE outbox SET status='preview'");
 env.MODE='production'; env.PUBLIC_ORIGIN='https://marlo.games'; env.EMAIL_ENABLED='true';
 const requested=await call('/order-access/request',{orderNumber:order.orderNumber,email:'pedidos@marlo.games'});
 assert.equal(requested.status,200);const challenge=await requested.json();
 const row=sqlite.prepare("SELECT * FROM outbox WHERE kind='order_code'").get();
 const payload=JSON.parse(row.payload),rendered=renderEmail('order_code',payload);
 rendered.subject='[PRUEBA TECNICA SIN COMPRA] '+rendered.subject;
 rendered.text='Prueba autorizada de verificación. No corresponde a una compra, cobro o envío real.\n'+rendered.text;
 rendered.html='<p>PRUEBA TÉCNICA AUTORIZADA. No corresponde a una compra, cobro o envío real.</p>'+rendered.html;
 sqlite.prepare('UPDATE outbox SET rendered=? WHERE id=?').run(JSON.stringify(rendered),row.id);
 await processOutbox(env);
 const sent=sqlite.prepare('SELECT status,provider_id,error FROM outbox WHERE id=?').get(row.id);
 assert.equal(sent.status,'sent',sent.error);
 const verified=await call('/order-access/verify',{challengeId:challenge.challengeId,code:payload.code});
 assert.equal(verified.status,200);
 assert.match(verified.headers.get('set-cookie'),/HttpOnly.*Secure/);
 const duplicate=await call('/order-access/verify',{challengeId:challenge.challengeId,code:payload.code});
 assert.equal(duplicate.status,403);
 const result={sent:true,recipient:'pedidos@marlo.games',emailId:sent.provider_id,oneUseVerified:true,secureSession:true,productionDatabaseModified:false};
 fs.writeFileSync(receipt,JSON.stringify(result,null,2));console.log(JSON.stringify(result));sqlite.close();
} finally {await vite.close();}
