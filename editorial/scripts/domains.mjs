import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const account='d761d6658813071217ba0bda1ffe3141',zone='1f21824f7adf7563d80d000f25a01c74';
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
const action=process.argv[2];
if(!['snapshot','activate','rollback','verify'].includes(action))throw Error('Choose snapshot, activate, rollback or verify.');
const config=await fs.readFile(path.join(os.homedir(),'AppData/Roaming/xdg.config/.wrangler/config/default.toml'),'utf8');
const token=process.env.CLOUDFLARE_API_TOKEN||config.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
if(!token)throw Error('Authenticate with Wrangler first.');
async function cf(endpoint,method='GET',body){const response=await fetch(base+endpoint,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const j=await response.json();if(!j.success)throw Error(JSON.stringify(j.errors));return j.result;}
const snapshotPath=new URL('../deployments/before-domain-change.json',import.meta.url);
async function site(url){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});return {url,status:r.status,location:r.headers.get('location'),hash:createHash('sha256').update(await r.text()).digest('hex')};}
if(action==='snapshot'){
 const domains=await cf('/workers/domains');if(domains.find(x=>x.hostname==='marlo.games')?.service!=='marlo-play')throw Error('Apex changed; inspect before proceeding.');
 const snapshot={date:new Date().toISOString(),domains,deployments:await cf('/workers/scripts/marlo-play/deployments'),sites:await Promise.all(['https://my.marlo.games/','https://play.marlo.games/','https://play.marlo.games/pigeongod','https://play.marlo.games/prepress'].map(site))};
 await fs.mkdir(new URL('../deployments/',import.meta.url),{recursive:true});await fs.writeFile(snapshotPath,JSON.stringify(snapshot,null,2),{flag:'wx'});console.log(JSON.stringify({snapshot:'saved',domains:domains.map(x=>({hostname:x.hostname,service:x.service})),sites:snapshot.sites}));
}else if(action==='activate'||action==='rollback'){
 const saved=JSON.parse(await fs.readFile(snapshotPath,'utf8'));const domains=await cf('/workers/domains');
 for(const name of ['my.marlo.games','play.marlo.games'])if(domains.find(x=>x.hostname===name)?.service!==saved.domains.find(x=>x.hostname===name)?.service)throw Error('Protected domain changed: '+name);
 const service=action==='activate'?'marlo-editorial':'marlo-play';
 if(action==='activate'&&!['marlo-play','marlo-editorial'].includes(domains.find(x=>x.hostname==='marlo.games')?.service))throw Error('Unexpected apex owner.');
 const names=action==='activate'?['marlo.games','www.marlo.games']:saved.domains.filter(x=>x.service===service).map(x=>x.hostname);
 const www=domains.find(x=>x.hostname==='www.marlo.games');if(action==='activate'&&www&&www.service!==service)throw Error('www has another owner; inspect before changing.');
 const origins=names.map(hostname=>({hostname,zone_id:zone}));
 const changes=await cf(`/workers/scripts/${service}/domains/changeset?replace_state=true`,'POST',origins);console.log(JSON.stringify({changes}));
 const result=await cf(`/workers/scripts/${service}/domains/records`,'PUT',{override_scope:true,override_existing_origin:true,override_existing_dns_record:false,origins});console.log(JSON.stringify({service,result}));
}else{
 const saved=JSON.parse(await fs.readFile(snapshotPath,'utf8'));const sites=await Promise.all(saved.sites.map(s=>site(s.url)));for(let i=0;i<sites.length;i++){if(JSON.stringify(sites[i])!==JSON.stringify(saved.sites[i]))throw Error('Protected site response changed: '+sites[i].url);}
 const domains=await cf('/workers/domains');console.log(JSON.stringify({protectedSitesUnchanged:true,domains:domains.map(x=>({hostname:x.hostname,service:x.service}))}));
}
