import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const output=await build({stdin:{contents:`export {renderEmail,emailCopy} from './api/email-templates.ts'`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {renderEmail,emailCopy}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const dir='docs/email-preview';await mkdir(dir,{recursive:true});
const sample={name:'Ana',orderNumber:'MG-2026-000001',delivery:'local',lines:[{title:'Intercambio Navideño',quantity:1,amount:25900}],total:25900,refundAmount:25900,appointment:'lunes, 26 de octubre de 2026, 10:00',meetingPoint:'Entrada principal, a un lado de la tienda Nike.',message:'Quisiera conocer más sobre sus juegos. ¡Gracias!',store:'Tienda de ejemplo',email:'ejemplo@example.com',phone:'+523300000000',code:'123456'};
const entries=[];
for(const kind of [...Object.keys(emailCopy),'order_code']){
 const payload=['shipped','delivered','label_created'].includes(kind)?{...sample,delivery:'national',carrier:'Paquetería de ejemplo',trackingNumbers:['TEST123456','TEST987654']}:{...sample};
 if(!kind.startsWith('pickup_')&&!kind.startsWith('internal_pickup_')) { delete payload.appointment; delete payload.meetingPoint; }
 const rendered=renderEmail(kind,payload);
 await writeFile(`${dir}/${kind}.html`,rendered.html);await writeFile(`${dir}/${kind}.txt`,rendered.text);entries.push({kind,subject:rendered.subject});
}
await writeFile(`${dir}/index.html`,`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marlo Games · Correos</title><style>body{background:#f8f1e5;color:#28251f;max-width:850px;margin:auto;padding:32px;font:16px/1.6 Arial}a{color:#923717}li{margin:16px 0}</style><h1>Correos de Marlo Games</h1><p>Vista de revisión local · Datos ficticios. No se han enviado estos mensajes.</p><ul>${entries.map(({kind,subject})=>`<li><a href="${kind}.html">${subject}</a> · <a href="${kind}.txt">Texto</a><br><small>${kind}</small></li>`).join('')}</ul></html>`);
console.log(`Exported ${entries.length} local HTML/text previews.`);
