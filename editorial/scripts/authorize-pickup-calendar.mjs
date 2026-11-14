// Run interactively on the owner's computer; never paste credentials into chat.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);
const arg=name=>args[args.indexOf(name)+1];
if(!args.includes('--credentials')||!args.includes('--calendar')||!args.includes('--config')) throw Error('Usage: node scripts/authorize-pickup-calendar.mjs --credentials <OAuth-client.json> --calendar <dedicated-calendar-id> --config <wrangler-config>');
const calendar=arg('--calendar'),config=arg('--config');
if(!calendar.endsWith('@group.calendar.google.com')) throw Error('Use a dedicated secondary calendar, not a personal primary calendar.');
const credentials=JSON.parse(await readFile(arg('--credentials'),'utf8')).web;
const redirect='http://127.0.0.1:8799/oauth/callback';
if(!credentials?.client_id||!credentials?.client_secret||!credentials.redirect_uris?.includes(redirect)) throw Error('Use a Web OAuth client with the documented loopback callback URI.');
const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');
const scopes=['https://www.googleapis.com/auth/calendar.events.owned','https://www.googleapis.com/auth/calendar.freebusy'];
let completing=false;
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,redirect);
 const supplied=Buffer.from(u.searchParams.get('state')||'');
 if(req.headers.host!=='127.0.0.1:8799'||u.pathname!=='/oauth/callback'||supplied.length!==state.length||!timingSafeEqual(supplied,Buffer.from(state))){res.writeHead(400);res.end('Invalid authorization callback.');return}
 if(completing){res.writeHead(409);res.end('Authorization is being processed.');return}
 completing=true;
 try {
  if(u.searchParams.has('error')||!u.searchParams.has('code')) throw Error('Authorization was not granted.');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,code:u.searchParams.get('code'),grant_type:'authorization_code',redirect_uri:redirect,code_verifier:verifier}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw Error('Google did not accept the authorization code.');
  const token=await r.json();
  if(!token.refresh_token||!token.access_token||!scopes.every(s=>(token.scope||'').split(' ').includes(s))) throw Error('Google did not grant offline access and all required scopes.');
  const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'};
  const events=await fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendar)+'/events?maxResults=1',{headers,signal:AbortSignal.timeout(10000)});
  if(!events.ok) throw Error('Cannot access the selected calendar. No secrets were installed.');
  const busy=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers,body:JSON.stringify({timeMin:new Date().toISOString(),timeMax:new Date(Date.now()+3600000).toISOString(),items:[{id:calendar}]}),signal:AbortSignal.timeout(10000)});
  const checked=await busy.json();
  if(!busy.ok||!checked.calendars?.[calendar]||checked.calendars[calendar].errors?.length) throw Error('Free/busy authorization failed. No secrets were installed.');
  const secrets={GOOGLE_CLIENT_ID:credentials.client_id,GOOGLE_CLIENT_SECRET:credentials.client_secret,GOOGLE_REFRESH_TOKEN:token.refresh_token,GOOGLE_CALENDAR_ID:calendar};
  const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[wrangler,'secret','bulk','--config',config],{stdio:['pipe','inherit','inherit'],windowsHide:true});
   child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Cloudflare did not install the secrets.')));
   child.stdin.end(JSON.stringify(secrets));
  });
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end('Autorización guardada en Cloudflare. Puedes cerrar esta pestaña. La conexión del calendario quedó actualizada.');
  console.log('Calendar authorization installed. No tokens were written to disk. Existing scheduling settings are unchanged.');
 } catch(err) {
  res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('No se completó la configuración. Revisa la terminal y vuelve a iniciar la autorización.');
  console.error(err instanceof Error?err.message:'Authorization failed.');process.exitCode=1;
 } finally {clearTimeout(timeout);server.close()}
});
const timeout=setTimeout(()=>{console.error('Authorization expired; restart the command.');server.close();process.exitCode=1},10*60000);
server.listen(8799,'127.0.0.1',()=>{
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:credentials.client_id,redirect_uri:redirect,response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 console.log('Open this Google authorization URL in your browser. Keep this terminal open:\n'+url.href);
});
