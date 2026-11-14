import fs from 'node:fs';
import { createServer } from 'vite';
const env = Object.fromEntries(fs.readFileSync(new URL('../.dev.vars.production', import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),JSON.parse(l.slice(i+1))];}));
if (!env.RESEND_API_KEY || env.EMAIL_FROM !== 'pedidos@marlo.games') throw Error('Missing key or unexpected sender');
const server = await createServer({server:{middlewareMode:true},appType:'custom'});
const testBatch = process.argv.includes('--suppression-fixed') ? '20261019-suppression-fixed' : process.argv.includes('--routing-fixed') ? '20261019-routing-fixed' : '20261019';
try {
  const {renderEmail} = await server.ssrLoadModule('/api/emails.ts');
  for (const kind of ['paid','shipped']) {
    const rendered = renderEmail(kind, {id:'PRUEBA-SIN-COMPRA',lines:[{quantity:1,title:'Intercambio Navideño',amount:25900}],total:25900,delivery:'national',...(kind==='shipped'?{tracking:'PRUEBA — NO ES UNA GUÍA REAL'}:{})},
      'PRUEBA AUTORIZADA: vista previa de '+(kind==='paid'?'confirmación de pago':'seguimiento')+'. No se ha realizado ningún cobro ni envío.');
    const r = await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'marlo-authorized-template-test-'+testBatch+'-'+kind},body:JSON.stringify({from:env.EMAIL_FROM,to:['pedidos@marlo.games'],subject:'[PRUEBA] '+rendered.subject,html:rendered.html})});
    const data=await r.json();
    console.log(JSON.stringify({kind,status:r.status,id:data.id,error:data.name}));
    if(r.ok && data.id) {
      await new Promise(resolve=>setTimeout(resolve,3000));
      const status=await fetch('https://api.resend.com/emails/'+data.id,{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(20000)});
      const delivery=await status.json();
      console.log(JSON.stringify({kind,id:data.id,lastEvent:delivery.last_event,status:status.status}));
    }
    if(!r.ok){process.exitCode=1;break;}
  }
} finally {await server.close();}
