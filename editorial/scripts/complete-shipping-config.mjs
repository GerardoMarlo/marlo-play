import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url), file=new URL('.dev.vars.production',root);
const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
const env=Object.fromEntries(lines.filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),JSON.parse(l.slice(i+1))];}));
const origin=JSON.parse(env.SHIPPING_ORIGIN_JSON);
if(!origin.email)origin.email='soporte@marlo.games';
const services=JSON.parse(fs.readFileSync(new URL('data/shipping-services.json',root),'utf8'));
if(!services.length||services.some(s=>s.validUntil<=Date.now()))throw Error('Shipping evidence expired; refresh from provider before installing');
const changed={SHIPPING_ORIGIN_JSON:JSON.stringify(origin),SHIPPING_SERVICES_JSON:JSON.stringify(services)};
for(const [key,value] of Object.entries(changed)){const i=lines.findIndex(l=>l.startsWith(key+'='));const line=key+'='+JSON.stringify(value);if(i<0)lines.push(line);else lines[i]=line;}
fs.writeFileSync(file,lines.join('\n'));
const child=spawn(process.execPath,[fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js',root)),'secret','bulk','--config','wrangler.production.jsonc'],{cwd:fileURLToPath(root),stdio:['pipe','pipe','pipe'],windowsHide:true});
child.stdout.resume();child.stderr.resume();child.stdin.end(JSON.stringify(changed));
child.on('exit',code=>{console.log(JSON.stringify({installed:code===0,keys:Object.keys(changed),senderEmail:origin.email,services:services.length}));process.exitCode=code||0;});
