import fs from 'node:fs';
const url='https://www.correosdemexico.gob.mx/sslservicios/consultacp/CodigoPostal_Exportar.aspx';
const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Postal source unavailable');
const html=await response.text();
fs.writeFileSync(new URL('../.wrangler/postal-export.local.html',import.meta.url),html);
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const form=new URLSearchParams();
for(const [tag] of html.matchAll(/<input\b[^>]*>/gi)){
 if(!/type="hidden"/i.test(tag))continue;
 const name=tag.match(/name="([^"]*)"/i)?.[1],value=tag.match(/value="([^"]*)"/i)?.[1]||'';
 if(name)form.set(decode(name),decode(value));
}
form.set('cboEdo','00');form.set('rblTipo','txt');form.set('btnDescarga.x','20');form.set('btnDescarga.y','10');
const cookies=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const download=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:cookies,Referer:url},body:form,signal:AbortSignal.timeout(60000)});
const bytes=Buffer.from(await download.arrayBuffer());
console.log(JSON.stringify({status:download.status,type:download.headers.get('content-type'),disposition:download.headers.get('content-disposition'),bytes:bytes.length,zip:bytes.subarray(0,2).toString()==='PK'}));
if(!download.ok||bytes.subarray(0,2).toString()!=='PK')throw Error('Expected official ZIP catalog; no import generated');
fs.writeFileSync(new URL('../.wrangler/postal-catalog.local.zip',import.meta.url),bytes);
