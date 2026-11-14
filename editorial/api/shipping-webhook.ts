import { BusinessError } from '../src/domain';
import { z } from 'zod';

// Skydropx signs the exact body with HMAC-SHA512 (lowercase hex).
// Only extract an identifier; status and URLs must be read back from our API client.
export async function verifyShippingWebhook(request:Request, secret?:string) {
  if(!secret) throw new BusinessError('Webhook Skydropx pendiente de configurar.',503);
  const signature=request.headers.get('Authorization') || '';
  if(!/^HMAC [a-f0-9]{128}$/.test(signature))throw new BusinessError('Firma inválida.',401);
  const reader=request.body?.getReader();
  if(!reader)throw new BusinessError('Evento vacío.',400);
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;
    if(length>64000){await reader.cancel();throw new BusinessError('Evento demasiado grande.',413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-512'},false,['verify']);
  const digest=Uint8Array.from(signature.slice(5).match(/../g)!,s=>parseInt(s,16));
  if(!await crypto.subtle.verify('HMAC',key,digest,bytes))throw new BusinessError('Firma inválida.',401);
  let payload:any;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new BusinessError('Evento inválido.',400);}
  const data=payload?.data;
  if(data?.type!=='packages' && data?.type!=='shipments')return null;
  return z.string().uuid().parse(data.type==='shipments'?data.id:data.relationships?.shipment?.data?.id);
}
