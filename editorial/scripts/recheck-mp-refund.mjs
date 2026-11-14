import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.sandbox',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const headers={Authorization:'Bearer '+env.MP_ACCESS_TOKEN,'Content-Type':'application/json'};
const request=async(path,init={})=>{const r=await fetch('https://api.mercadopago.com'+path,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(25000)});return {r,d:await r.json()};};
const account=await request('/users/me');
if(!account.r.ok||!account.d.tags?.includes('test_user'))throw Error('Sandbox account required');
const id=process.argv.find(a=>a.startsWith('ORDTST')) || 'ORDTST01M5E3Q0MZGYFEBNT5ARKTKQAG';
const before=await request('/v1/orders/'+id);
console.log(JSON.stringify({step:'read',http:before.r.status,id,status:before.d.status,statusDetail:before.d.status_detail,payments:before.d.transactions?.payments?.map(p=>({id:p.id,status:p.status,statusDetail:p.status_detail})),refunds:before.d.transactions?.refunds}));
if(!before.r.ok||!before.d.external_reference?.startsWith('TEST-'))throw Error('Expected isolated test order');
if(before.d.status==='processed'&&process.argv.includes('--refund')){
 const result=await request('/v1/orders/'+id+'/refund',{method:'POST',headers:{'X-Idempotency-Key':before.d.external_reference+'-refund'}});
 console.log(JSON.stringify({step:'refund',http:result.r.status,status:result.d.status,error:result.d.error,message:result.d.message,errors:result.d.errors,requestId:result.r.headers.get('x-request-id')}));
 const after=await request('/v1/orders/'+id);
 console.log(JSON.stringify({step:'readback',http:after.r.status,status:after.d.status,statusDetail:after.d.status_detail}));
 if(after.d.status!=='refunded')process.exitCode=1;
}

