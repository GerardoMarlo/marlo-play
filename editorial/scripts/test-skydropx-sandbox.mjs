import fs from 'node:fs';
import {createServer} from 'vite';
const e=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.sandbox',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));
if(!e.SKYDROPX_CLIENT_ID||!e.SKYDROPX_CLIENT_SECRET)throw Error('Sandbox credentials missing');
const base='https://sb-pro.skydropx.com';
const r=await fetch(base+'/api/v1/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:e.SKYDROPX_CLIENT_ID,client_secret:e.SKYDROPX_CLIENT_SECRET}),signal:AbortSignal.timeout(20000)});
console.log(JSON.stringify({environment:'sandbox',step:'authentication',http:r.status}));
if(!r.ok)process.exit(1);
const token=(await r.json()).access_token;
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
if(process.argv.includes('--read')){
 const saved=JSON.parse(fs.readFileSync(new URL('../.wrangler/skydropx-sandbox-shipment.local.json',import.meta.url),'utf8'));
 const result=await fetch(base+'/api/v1/shipments/'+encodeURIComponent(saved.data.id),{headers,signal:AbortSignal.timeout(20000)});
 if(!result.ok)throw Error('Read shipment HTTP '+result.status);
 const state=await result.json();
 fs.writeFileSync(new URL('../.wrangler/skydropx-sandbox-readback.local.json',import.meta.url),JSON.stringify(state));
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try {
  const {getShipment}=await server.ssrLoadModule('/api/skydropx.ts');
  const actual=await getShipment({...e,MODE:'sandbox',SKYDROPX_ENVIRONMENT:'sandbox'},saved.data.id);
  console.log(JSON.stringify({environment:'sandbox',step:'readback',id:actual.id,workflow:actual.workflow,cost:actual.cost,packages:actual.packages.length,labelsReady:actual.packages.every(p=>p.tracking_number&&/^https:\/\//.test(p.label_url||''))&&actual.packages.length>0}));
 } finally {await server.close();}
 process.exit(0);
}
const address_from={country_code:'MX',postal_code:'45066',area_level1:'Jalisco',area_level2:'Zapopan',area_level3:'Natura Bosque Residencial'};
const address_to={country_code:'MX',postal_code:'06000',area_level1:'Ciudad de México',area_level2:'Cuauhtémoc',area_level3:'Centro (Área 1)'};
const quoted=await fetch(base+'/api/v1/quotations',{method:'POST',headers,body:JSON.stringify({quotation:{address_from,address_to,parcels:[{length:12,width:9,height:5,weight:.285}]}}),signal:AbortSignal.timeout(20000)});
if(!quoted.ok)throw Error('Sandbox quote HTTP '+quoted.status);
let q=await quoted.json();
for(let n=0;n<12&&!q.is_completed;n++){await new Promise(r=>setTimeout(r,1000));const result=await fetch(base+'/api/v1/quotations/'+encodeURIComponent(q.id),{headers,signal:AbortSignal.timeout(20000)});if(!result.ok)throw Error('Quote poll failed');q=await result.json();}
fs.writeFileSync(new URL('../.wrangler/skydropx-sandbox-quote.local.json',import.meta.url),JSON.stringify(q));
console.log(JSON.stringify({environment:'sandbox',step:'quotation',id:q.id,complete:q.is_completed,successfulRates:q.rates?.filter(r=>r.success).map(r=>({id:r.id,carrier:r.provider_name,service:r.provider_service_code,total:r.total,days:r.days}))}));
if(process.argv.includes('--label')){
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try{
  const {chooseShipping}=await server.ssrLoadModule('/api/shipping-policy.ts');
  const {prepareShipment,createShipment,getShipment}=await server.ssrLoadModule('/api/skydropx.ts');
  const proof=JSON.parse(fs.readFileSync(new URL('../data/shipping-services.json',import.meta.url),'utf8'));
  const settings={...e,MODE:'sandbox',SKYDROPX_ENVIRONMENT:'sandbox',LABELS_ENABLED:'true',SHIPPING_SERVICES_JSON:JSON.stringify(proof),SHIPPING_CONSIGNMENT_NOTE:'60141103',SHIPPING_PACKAGE_TYPE:'5H4',SHIPPING_ORIGIN_JSON:JSON.stringify({...address_from,street1:'Calle de prueba 123',name:'PRUEBA SANDBOX MARLO',company:'Marlo Games',phone:'3312345678',email:'pedidos@marlo.games',reference:'PRUEBA SIN RECOLECCION REAL'})};
  const quote={id:q.id,...chooseShipping(q.rates,proof,1),expires:Date.now()+600000,fixture:false,parcels:[{length:12,width:9,height:5,weight:.285}]};
  const address={recipient:'PRUEBA SANDBOX',phone:'5512345678',email:'pedidos@marlo.games',street:'Calle de prueba',exterior:'123',postalCode:'06000',colony:'Centro (Área 1)',city:'Cuauhtémoc',state:'Ciudad de México',country:'MX',references:'PRUEBA SIN ENTREGA REAL'};
  const payload=await prepareShipment(settings,quote,address);
  const shipment=await createShipment(settings,payload);
  const shipmentId=shipment.data?.id;
  fs.writeFileSync(new URL('../.wrangler/skydropx-sandbox-shipment.local.json',import.meta.url),JSON.stringify(shipment));
  console.log(JSON.stringify({environment:'sandbox',step:'create-shipment',id:shipmentId,type:shipment.data?.type}));
  if(!shipmentId)throw Error('No sandbox shipment ID returned');
  const state=await getShipment(settings,shipmentId);
  console.log(JSON.stringify({environment:'sandbox',step:'read-shipment',workflow:state.workflow,cost:state.cost,packages:state.packages.length}));
 }finally{await server.close();}
}
