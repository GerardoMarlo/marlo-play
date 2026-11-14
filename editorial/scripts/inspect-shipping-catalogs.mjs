import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.production',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const base='https://api-pro.skydropx.com';
const r=await fetch(base+'/api/v1/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.SKYDROPX_CLIENT_ID,client_secret:env.SKYDROPX_CLIENT_SECRET}),signal:AbortSignal.timeout(20000)});
if(!r.ok)throw Error('Skydropx authentication failed');
const token=(await r.json()).access_token;
for(const resource of ['consignment_notes','package_templates']){
 await new Promise(resolve=>setTimeout(resolve,650));
 const res=await fetch(base+'/api/v1/shipments/'+resource+(resource==='consignment_notes'?'?description='+encodeURIComponent(process.argv[2]||'juegos'):''),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 const data=await res.json();
 fs.writeFileSync(new URL('../.wrangler/'+resource+'.local.json',import.meta.url),JSON.stringify(data,null,2));
 console.log(JSON.stringify({resource,status:res.status,data}));
}
