import fs from 'node:fs';
import {createServer} from 'vite';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.sandbox',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const settings={...env,MODE:'sandbox',PAYPAL_ENVIRONMENT:'sandbox',PAYMENTS_ENABLED:'true',PAYPAL_ENABLED:'true',PUBLIC_ORIGIN:'https://marlo.games'};
const file=new URL('../.wrangler/paypal-sandbox-test.local.json',import.meta.url);
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {createPayment,paymentStatus,capturePaypal,refundPayment}=await server.ssrLoadModule('/api/providers.ts');
 let order=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 if(!order){order={id:'TEST-'+crypto.randomUUID(),provider:'paypal',email:'test@example.com',total:25900};const created=await createPayment(settings,order);order.provider_id=created.id;fs.writeFileSync(file,JSON.stringify(order));}
 const auth=await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
 if(!auth.ok)throw Error('Sandbox authentication failed');const token=(await auth.json()).access_token;
 const response=await fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders/'+encodeURIComponent(order.provider_id),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Sandbox order read failed');const data=await response.json();
 console.log(JSON.stringify({sandbox:true,status:data.status,providerId:order.provider_id,approvalUrl:data.links?.find(l=>['payer-action','approve'].includes(l.rel))?.href}));
 if(process.argv.includes('--capture')){
  if(data.status==='APPROVED')await capturePaypal(settings,order);
  const state=await paymentStatus(settings,order);console.log(JSON.stringify({sandbox:true,state}));
  if(state==='paid' && process.argv.includes('--refund')){await refundPayment(settings,{...order,payment:'paid'});console.log(JSON.stringify({sandbox:true,refundState:await paymentStatus(settings,order)}));}
 }
}finally{await server.close();}
