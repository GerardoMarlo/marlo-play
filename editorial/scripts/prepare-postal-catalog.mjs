import fs from 'node:fs';
import crypto from 'node:crypto';
const bytes=fs.readFileSync(new URL('../.wrangler/postal-catalog/CPdescarga.txt',import.meta.url));
const text=new TextDecoder('windows-1252',{fatal:true}).decode(bytes);
const lines=text.split(/\r?\n/).filter(Boolean);
const header=lines[1].split('|');
for(const field of ['d_codigo','d_asenta','D_mnpio','d_estado'])if(!header.includes(field))throw Error('Unexpected catalog schema');
const rows=new Map();let duplicates=0;
for(const line of lines.slice(2)){
 const fields=line.split('|');
 if(fields.length!==header.length)throw Error('Malformed catalog row');
 const get=name=>fields[header.indexOf(name)].trim();
 const row=[get('d_codigo'),get('d_asenta'),get('D_mnpio'),get('d_estado')];
 if(!/^\d{5}$/.test(row[0])||row.some(v=>!v||v.includes('\uFFFD')))throw Error('Invalid postal record');
 const key=JSON.stringify(row.slice(0,2));
 if(rows.has(key)){if(JSON.stringify(rows.get(key))!==JSON.stringify(row))throw Error('Ambiguous postal key '+key);duplicates++;}
 rows.set(key,row);
}
if(rows.size<100000)throw Error('Incomplete national catalog');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const source='SEPOMEX 2026-10-18';
const sql=["-- Official SEPOMEX catalog, internal address validation. No customer/order data modified."];
const values=[...rows.values()];
for(let offset=0;offset<values.length;offset+=100){
 sql.push('INSERT INTO postal_codes(code,colony,city,state,source) VALUES '+values.slice(offset,offset+100).map(r=>'('+[...r,source].map(quote).join(',')+')').join(',')+' ON CONFLICT(code,colony) DO UPDATE SET city=excluded.city,state=excluded.state,source=excluded.source;');
}
fs.writeFileSync(new URL('../.wrangler/postal-catalog.local.sql',import.meta.url),sql.join('\n'));
console.log(JSON.stringify({rows:rows.size,duplicates,source,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),samples:values.filter(r=>['06000','64000','45066'].includes(r[0]))},null,2));
