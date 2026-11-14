import fs from 'node:fs';
import {createHmac} from 'node:crypto';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.sandbox',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
if(!env.MP_WEBHOOK_SECRET)throw Error('Sandbox webhook secret missing');
const id='ORDTST01M5BBSEKEC571TPC3KF1NDQ27',rid=crypto.randomUUID(),ts=String(Date.now());
const signature=createHmac('sha256',env.MP_WEBHOOK_SECRET).update(`id:${id};request-id:${rid};ts:${ts};`).digest('hex');
for(const valid of [false,true]){
 const r=await fetch('https://marlo.games/api/webhooks/mercadopago/sandbox?data.id='+id,{method:'POST',headers:{'content-type':'application/json','x-request-id':rid,'x-signature':`ts=${ts},v1=${valid?signature:'0'.repeat(64)}`},body:JSON.stringify({id:'manual-verifier-'+rid,action:'manual.signature_test',data:{id}}),signal:AbortSignal.timeout(20000)});
 console.log(JSON.stringify({validSignature:valid,http:r.status,body:await r.json(),authenticProviderEvent:false}));
 if(r.status!==(valid?200:401))process.exitCode=1;
}
