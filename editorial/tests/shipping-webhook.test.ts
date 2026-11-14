import {it,expect} from 'vitest';
import {verifyShippingWebhook} from '../api/shipping-webhook';
const secret='test-only-secret';
const id='93774c22-8275-4757-9963-71b79b2e8db7';
async function request(raw:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-512'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 return new Request('https://marlo.games/api/webhooks/skydropx',{method:'POST',headers:{Authorization:'HMAC '+signature},body:raw});
}
it('extracts shipment ID from signed package without trusting status or URLs',async()=>{
 const raw=JSON.stringify({data:{type:'packages',attributes:{status:'delivered'},relationships:{shipment:{data:{id},links:{related:'https://attacker.example/'}}}}});
 expect(await verifyShippingWebhook(await request(raw),secret)).toBe(id);
});
it('rejects tampered body and missing signature',async()=>{
 const r=await request('{}');
 await expect(verifyShippingWebhook(new Request(r.url,{method:'POST',headers:r.headers,body:'{ }'}),secret)).rejects.toThrow('Firma');
 await expect(verifyShippingWebhook(new Request(r.url,{method:'POST',body:'{}'}),secret)).rejects.toThrow('Firma');
});
it('fails closed for missing secret and ignores unrelated signed events',async()=>{
 await expect(verifyShippingWebhook(await request('{}'))).rejects.toThrow('configurar');
 expect(await verifyShippingWebhook(await request('{"data":{"type":"quotation"}}'),secret)).toBeNull();
});
it('limits body size even without Content-Length',async()=>{
 await expect(verifyShippingWebhook(await request(' '.repeat(64001)),secret)).rejects.toThrow('grande');
});
