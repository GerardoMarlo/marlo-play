import fs from 'node:fs';
import {createHmac} from 'node:crypto';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.production',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
if(!env.SKYDROPX_WEBHOOK_SECRET)throw Error('Missing webhook secret');
// An unrelated event exercises verification without touching orders or shipments.
const body=JSON.stringify({data:{type:'packages',relationships:{shipment:{data:{id:'00000000-0000-4000-8000-000000000000'}}}}});
const signature=createHmac('sha512',env.SKYDROPX_WEBHOOK_SECRET).update(body).digest('hex');
for(const valid of [false,true]){
 const response=await fetch('https://marlo.games/api/webhooks/skydropx',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'HMAC '+(valid?signature:'0'.repeat(128))},body,signal:AbortSignal.timeout(20000)});
 const result=await response.json();
 console.log(JSON.stringify({validSignature:valid,httpStatus:response.status,received:result.received,ignored:result.ignored}));
 if(response.status!==(valid?200:401) || (valid&&result.ignored!==true))process.exitCode=1;
}
