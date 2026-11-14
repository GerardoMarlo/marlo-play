import assert from 'node:assert/strict';
for (const quantity of [6,10,20]) {
 const response=await fetch('https://marlo.games/api/quotes',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://marlo.games'},body:JSON.stringify({items:[{id:'intercambio-navideno',quantity}],address:{recipient:'PRUEBA',phone:'5512345678',email:'pedidos@marlo.games',street:'Calle de prueba',exterior:'1',interior:'',postalCode:'06000',colony:'Centro (Área 1)',city:'Cuauhtémoc',state:'Ciudad de México',country:'MX',references:''}}),signal:AbortSignal.timeout(20000)});
 const body=await response.json();
 assert.equal(response.status,200,body.error);
 assert.equal(body.shipping,7000);
 assert.equal(body.manualFulfillment,undefined);
 assert.equal(typeof body.carrier,'string');
 assert(body.carrier.length>0);
 assert.equal(body.fixture,false);
 console.log(JSON.stringify({quantity,shippingMXN:body.shipping/100,carrier:body.carrier,internalDetailsExposed:false,orderCreated:false,labelPurchased:false}));
}
