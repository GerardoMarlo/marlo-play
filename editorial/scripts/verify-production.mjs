const results = [];
for (const url of ['https://marlo.games/', 'https://www.marlo.games/', 'https://my.marlo.games/', 'https://play.marlo.games/',
  'https://marlo.games/checkout/processing', 'https://marlo.games/checkout/success', 'https://marlo.games/checkout/failure',
  'https://marlo.games/checkout/paypal/return', 'https://marlo.games/checkout/paypal/cancel', 'https://marlo.games/api/catalog', 'https://marlo.games/api/admin/session']) {
  const response = await fetch(url, {redirect: 'manual', signal: AbortSignal.timeout(20000)});
  const location = response.headers.get('location');
  const result = {url, status: response.status, location: location?.includes('.cloudflareaccess.com/') ? new URL(location).origin + new URL(location).pathname : location};
  if (url.endsWith('/api/catalog') && response.ok) {
    const body = await response.json();
    result.catalog = {products: body.products?.map(p => ({id:p.id,sku:p.sku,stock:p.stock,price:p.price,fixture:p.fixture})),
      mode:body.mode, providers:body.providers, paymentsEnabled:body.paymentsEnabled,formsEnabled:body.formsEnabled};
  }
  results.push(result);
}
for(const code of ['06000','64000','45066']){
 const response=await fetch('https://marlo.games/api/postal?code='+code,{signal:AbortSignal.timeout(20000)});
 const rows=await response.json();
 const valid=response.ok&&Array.isArray(rows)&&rows.length>0&&rows.every(r=>r.code===code&&r.source==='SEPOMEX 2026-10-18');
 results.push({postalCode:code,status:response.status,count:rows.length,valid});
 if(!valid)process.exitCode=1;
}
for (const suffix of ['paypal', 'paypal/sandbox', 'mercadopago']) {
  const response = await fetch('https://marlo.games/api/webhooks/' + suffix, {method:'POST',
    headers: {'Content-Type':'application/json'}, body: JSON.stringify({id:'verification-forged-event',event_type:'PAYMENT.CAPTURE.COMPLETED'}), signal: AbortSignal.timeout(20000)});
  results.push({webhook:suffix,unsignedStatus:response.status});
}
console.log(JSON.stringify(results, null, 2));
