import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const secrets=Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.sandbox',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const vite=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {planPackaging,provisionalPackaging}=await vite.ssrLoadModule('/src/packaging.ts');
 const {quoteSkydropx,prepareShipment,createShipment,getShipment}=await vite.ssrLoadModule('/api/skydropx.ts');
 const env={...secrets,MODE:'sandbox',SKYDROPX_ENVIRONMENT:'sandbox',LABELS_ENABLED:'true',SHIPPING_CONSIGNMENT_NOTE:'60141103',SHIPPING_PACKAGE_TYPE:'5H4',SHIPPING_PACKAGING_JSON:JSON.stringify(provisionalPackaging),SHIPPING_SERVICES_JSON:fs.readFileSync(new URL('../data/shipping-services.json',import.meta.url),'utf8'),SHIPPING_ORIGIN_JSON:JSON.stringify({country_code:'MX',postal_code:'45066',area_level1:'Jalisco',area_level2:'Zapopan',area_level3:'Natura Bosque Residencial',street1:'Calle de prueba 123',name:'PRUEBA SANDBOX',company:'Marlo Games',phone:'3312345678',email:'pedidos@marlo.games',reference:'SIN RECOLECCION REAL'})};
 const address={recipient:'PRUEBA SANDBOX',phone:'5512345678',email:'pedidos@marlo.games',street:'Calle de prueba',exterior:'123',postalCode:'06000',colony:'Centro (Área 1)',city:'Cuauhtémoc',state:'Ciudad de México',country:'MX',references:'SIN ENTREGA REAL'};
 const parcels=planPackaging(provisionalPackaging,[{id:'intercambio-navideno',quantity:6}],false);
 const quote=await quoteSkydropx(env,address,parcels);
 assert.equal(quote.parcels.length,2);
 const receipt=new URL('../.wrangler/multi-bag-sandbox-2026-10-22.json',import.meta.url);
 let id=fs.existsSync(receipt)?JSON.parse(fs.readFileSync(receipt,'utf8')).shipmentId:null;
 if(!id){
  const payload=await prepareShipment(env,quote,address);
  assert.equal(payload.shipment.packages.length,2);
  const created=await createShipment(env,payload);id=created.data?.id;assert(id);
  fs.writeFileSync(receipt,JSON.stringify({shipmentId:id,environment:'sandbox'}));
 }
 let shipment;
 for(let i=0;i<12;i++){
  shipment=await getShipment(env,id);
  if(shipment.packages.filter(p=>p.tracking_number&&p.label_url).length===2)break;
  await new Promise(r=>setTimeout(r,1000));
 }
 const labels=shipment.packages.filter(p=>p.tracking_number&&/^https:\/\//.test(p.label_url||''));
 const result={environment:'sandbox',units:6,bags:parcels.map(p=>p.packaging.units),labels:labels.length,distinctGuides:new Set(labels.map(p=>p.tracking_number)).size,workflow:shipment.workflow,realMoney:false,realPickup:false};
 console.log(JSON.stringify(result));
 assert.equal(result.labels,2);assert.equal(result.distinctGuides,2);
}finally{await vite.close();}
