import fs from 'node:fs';
// Read-only provider checks. Do not print credentials, tokens or account data.
for (const mode of ['sandbox','production']) {
  const file=new URL('../.dev.vars.'+mode,import.meta.url);
  const env=Object.fromEntries(fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
  try {
    const response=await fetch('https://api.mercadopago.com/v1/payment_methods',{headers:{Authorization:'Bearer '+env.MP_ACCESS_TOKEN},signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    console.log(JSON.stringify({mode,provider:'mercadopago',status:response.status,cards:Array.isArray(data)?data.filter(m=>m.status==='active'&&['credit_card','debit_card'].includes(m.payment_type_id)).map(m=>({id:m.id,type:m.payment_type_id,min:m.min_allowed_amount,max:m.max_allowed_amount,hasOfficialLogo:!!m.secure_thumbnail})):[]}));
    const base=mode==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
    const paypal=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({mode,provider:'paypal',status:paypal.status,authenticated:paypal.ok}));
  }catch {console.log(JSON.stringify({mode,error:'Provider check unavailable'}));process.exitCode=1;}
}
