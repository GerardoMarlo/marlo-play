import fs from 'node:fs';
import {createServer} from 'vite';
const env=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.sandbox',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const headers={Authorization:'Bearer '+env.MP_ACCESS_TOKEN,'Content-Type':'application/json'};
const account=await fetch('https://api.mercadopago.com/users/me',{headers,signal:AbortSignal.timeout(20000)});
if(!account.ok || !(await account.json()).tags?.includes('test_user'))throw Error('Refusing payment test: account is not a verified test user');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{const response=await originalFetch(...args);if(!response.ok){const d=await response.clone().json().catch(()=>({}));console.log(JSON.stringify({providerHttp:response.status,keys:Object.keys(d),dataKeys:Object.keys(d.data||{}),code:d.error,message:d.message,errors:d.errors?.map(x=>({code:x.code,message:x.message,keys:Object.keys(x)})),orderId:d.data?.id,orderStatus:d.data?.status,statusDetail:d.data?.status_detail}));}return response;};
try{
 const {createPayment,paymentStatus,refundPayment}=await server.ssrLoadModule('/api/providers.ts');
 for(const scenario of ['APRO','FUND','CONT']){
  // Official Mercado Pago Mexico test card; never accepts real card input.
  const response=await fetch('https://api.mercadopago.com/v1/card_tokens',{method:'POST',headers,body:JSON.stringify({card_number:'5474925432670366',expiration_month:11,expiration_year:2030,security_code:'123',cardholder:{name:scenario}}),signal:AbortSignal.timeout(20000)});
  const token=await response.json();
  if(!response.ok){console.log(JSON.stringify({scenario,step:'tokenize',status:response.status,error:token.error,codes:token.cause?.map(c=>c.code)}));process.exitCode=1;break;}
  const settings={...env,MODE:'sandbox',PAYMENTS_ENABLED:'true',MP_ENABLED:'true',PUBLIC_ORIGIN:'https://marlo.games'};
  const order={id:'TEST-'+crypto.randomUUID(),provider:'mercadopago',email:'test@testuser.com',total:25900};
  try{
   const payment=await createPayment(settings,order,{token:token.id,payment_method_id:'master',installments:1});
   const state=await paymentStatus(settings,{...order,provider_id:payment.id});
   console.log(JSON.stringify({scenario,providerId:payment.id,state,expected:{APRO:'paid',FUND:'rejected',CONT:'pending'}[scenario],sandbox:true}));
   if(state!=={APRO:'paid',FUND:'rejected',CONT:'pending'}[scenario])process.exitCode=1;
   if(scenario==='APRO' && state==='paid'){
    const duplicate=await createPayment(settings,order,{token:token.id,payment_method_id:'master',installments:1});
    console.log(JSON.stringify({scenario,idempotent:duplicate.id===payment.id}));
    if(duplicate.id!==payment.id)throw Error('Idempotency mismatch');
    const paid={...order,provider_id:payment.id,payment:'paid'};
    await refundPayment(settings,paid);
    const refunded=await paymentStatus(settings,paid);
    console.log(JSON.stringify({scenario,refundState:refunded,sandbox:true}));
    if(refunded!=='refunded')process.exitCode=1;
   }
  }catch(error){console.log(JSON.stringify({scenario,error:error.message,sandbox:true}));process.exitCode=1;}
 }
}finally{await server.close();}
