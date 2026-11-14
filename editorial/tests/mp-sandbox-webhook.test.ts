import {it,expect} from 'vitest';
import {database} from './db';
import worker from '../api/worker';
import type {Env} from '../api/types';
it('isolates authenticated MP sandbox events, deduplicates them and rejects live signatures',async()=>{
 const {db:DB,sqlite}=database();
 const e={DB,MODE:'production',PUBLIC_ORIGIN:'https://marlo.games',MP_SANDBOX_WEBHOOK_SECRET:'sandbox-secret',MP_WEBHOOK_SECRET:'live-secret'} as Env;
 const request=async(secret:string)=>{
  const ts=String(Date.now()),id='ORDTST123',rid='test-request';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`id:${id};request-id:${rid};ts:${ts};`))).toString('hex');
  return new Request('https://marlo.games/api/webhooks/mercadopago/sandbox?data.id='+id,{method:'POST',headers:{'content-type':'application/json','x-request-id':rid,'x-signature':`ts=${ts},v1=${signature}`},body:JSON.stringify({action:'order.processed',data:{id}})});
 };
 expect((await worker.fetch(await request('live-secret'),e)).status).toBe(401);
 for(let i=0;i<2;i++)expect((await worker.fetch(await request('sandbox-secret'),e)).status).toBe(200);
 expect(sqlite.prepare('SELECT COUNT(*) AS n FROM sandbox_webhook_events').get()?.n).toBe(1);
 expect(sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get()?.n).toBe(0);
 sqlite.close();
});
