import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const env=Object.fromEntries((await fs.readFile(path.join(root,'.dev.vars.sandbox'),'utf8')).split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const response=await fetch('https://api.mercadopago.com/v1/payment_methods',{headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('Could not verify card artwork');
const methods=await response.json();
const target=path.join(root,'public/images/payments');await fs.mkdir(target,{recursive:true});
const sources={mercadopago:'https://http2.mlstatic.com/frontend-assets/dx-template-lib/assets/logo-mercadopago.svg'};
for(const [key,id] of Object.entries({visa:'visa',mastercard:'master',amex:'amex'})){
 const method=methods.find(m=>m.id===id&&m.status==='active');
 if(!method?.secure_thumbnail)throw Error('Missing official artwork: '+key);
 sources[key]=method.secure_thumbnail;
}
for(const [key,url] of Object.entries(sources)){
 const u=new URL(url);if(u.protocol!=='https:'||!['http2.mlstatic.com','www.mercadopago.com','www.mercadopago.com.mx'].includes(u.hostname))throw Error('Unexpected artwork host');
 const asset=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!asset.ok)throw Error('Artwork unavailable: '+key);
 const extension=key==='mercadopago'?'.svg':path.extname(u.pathname);
 await fs.writeFile(path.join(target,key+extension),Buffer.from(await asset.arrayBuffer()));
 console.log(JSON.stringify({brand:key,file:key+extension}));
}
await fs.writeFile(path.join(target,'SOURCES.md'),'Official Mercado Pago developer header and payment-method artwork. Retrieved 2026-10-21. Brand marks belong to their respective owners.\n\n'+Object.entries(sources).map(([key,url])=>`- ${key}: ${url}`).join('\n')+'\n');
