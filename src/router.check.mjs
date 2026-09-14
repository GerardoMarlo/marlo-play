import {test} from 'node:test';
import assert from 'node:assert/strict';
import {targetFor,handle} from './worker.mjs';
test('exact prefix, root and query mapping',()=>{for(const [path,expected] of [['/pigeongod','/'],['/pigeongod/','/'],['/pigeongod/art/cat.webp?v=2','/art/cat.webp?v=2']])assert.equal(targetFor(new URL('https://play.marlo.games'+path)).url.href,'https://pigeongod-origin.marlo.games'+expected);for(const path of ['/rats','/pigeongod-other','/__proto__','/game3'])assert.equal(targetFor(new URL('https://play.marlo.games'+path)),null);});
test('homepage catalogue and unknown routes',async()=>{const home=await handle(new Request('https://marlo.games/'));assert.equal(home.status,200);const html=await home.text();assert.match(html,/NOT GAMES/);assert.ok(html.includes('href="https://play.marlo.games/pigeongod"'));assert.doesNotMatch(html,/pigeongod-origin/);assert.equal((await handle(new Request('https://play.marlo.games/rats'))).status,404);});
test('binary assets stream; cookies do not cross game boundaries',async()=>{const response=await handle(new Request('https://play.marlo.games/pigeongod/art/a.webp',{headers:{Cookie:'private=1'}}),async(url,opts)=>{assert.equal(url,'https://pigeongod-origin.marlo.games/art/a.webp');assert.equal(opts.headers.has('Cookie'),false);return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp','Set-Cookie':'other=1'}})});assert.equal(response.headers.has('Set-Cookie'),false);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);});
test('redirects stay under the public mount',async()=>{const r=await handle(new Request('https://play.marlo.games/pigeongod/start'),async()=>new Response(null,{status:302,headers:{Location:'/next?x=1'}}));assert.equal(r.headers.get('Location'),'/pigeongod/next?x=1');});
test('missing assets are not successful SPA HTML; failures are explicit',async()=>{const req=new Request('https://play.marlo.games/pigeongod/missing.js');assert.equal((await handle(req,async()=>new Response('html',{headers:{'Content-Type':'text/html'}}))).status,404);assert.equal((await handle(req,async()=>{throw Error('offline')})).status,502);});

test('play root redirects to MARLO; apex does not proxy game paths',async()=>{
 for(const method of ['GET','HEAD']){
 const r=await handle(new Request('https://play.marlo.games/?from=play',{method}));
 assert.equal(r.status,308);assert.equal(r.headers.get('Location'),'https://marlo.games/?from=play');
 }
 assert.equal((await handle(new Request('https://marlo.games/pigeongod'))).status,404);
 const r=await handle(new Request('http://marlo.games/'));assert.equal(r.headers.get('Location'),'https://marlo.games/');
});
