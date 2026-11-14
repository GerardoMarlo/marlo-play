import fs from 'node:fs';
import dns from 'node:dns/promises';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.production',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const ids=process.argv.slice(2).filter(arg=>/^[0-9a-f-]{36}$/.test(arg));
for(const id of ids.length?ids:['01a156ad-105e-7dab-98a3-6ff4df9c9c40','01a156ad-1d95-71e9-a63d-091309927355']){
 const r=await fetch('https://api.resend.com/emails/'+id,{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(20000)});
 const d=await r.json(); console.log(JSON.stringify({id,httpStatus:r.status,lastEvent:d.last_event,error:d.name,message:r.ok?undefined:d.message}));
}
const suppression=await fetch('https://api.resend.com/suppressions/pedidos%40marlo.games',{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(20000)});
const suppressed=await suppression.json();
console.log(JSON.stringify({suppressionStatus:suppression.status,origin:suppressed.origin,sourceId:suppressed.source_id,error:suppressed.name}));
if(process.argv.includes('--clear-test-bounce') && suppression.ok && suppressed.origin==='bounce'){
 const removed=await fetch('https://api.resend.com/suppressions/pedidos%40marlo.games',{method:'DELETE',headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(20000)});
 console.log(JSON.stringify({bounceSuppressionRemoved:removed.ok,status:removed.status}));
}
for(const name of ['marlo.games','send.marlo.games']){
 for(const type of ['MX','TXT'])try{console.log(JSON.stringify({name,type,records:await dns.resolve(name,type)}));}catch{console.log(JSON.stringify({name,type,unavailable:true}));}
}
