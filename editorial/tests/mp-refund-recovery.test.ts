import {afterEach,expect,it,vi} from 'vitest';
import {refundPayment} from '../api/providers';
import type {Env,OrderRow} from '../api/types';
const env={MODE:'sandbox',PAYMENTS_ENABLED:'true',MP_ACCESS_TOKEN:'test'} as Env;
const order={id:'TEST-REFUND',provider:'mercadopago',provider_id:'ORDTST-test',payment:'paid',total:25900} as OrderRow;
const state=(status:string)=>Response.json({external_reference:order.id,currency:'MXN',live_mode:false,total_amount:'259.00',status,status_detail:status==='processed'?'accredited':status});
afterEach(()=>vi.restoreAllMocks());
it('reconciles an already refunded order without another refund POST',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>state('refunded'));
 await refundPayment(env,order);expect(spy).toHaveBeenCalledTimes(1);
});
it('recovers a lost refund response by reading confirmed provider state',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(state('processed')).mockResolvedValueOnce(Response.json({errors:[{code:'unprocessable_entity'}]},{status:422})).mockResolvedValueOnce(state('refunded'));
 await refundPayment(env,order);
 expect((spy.mock.calls[1][1]?.headers as any)['X-Idempotency-Key']).toBe('TEST-REFUND-refund');
});
it('does not claim a failed refund succeeded and preserves the retry key',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>init?.method==='POST'?Response.json({errors:[{code:'unprocessable_entity'}]},{status:422}):state('processed'));
 await expect(refundPayment(env,order)).rejects.toThrow('todavía no confirmó');
 await expect(refundPayment(env,order)).rejects.toThrow('todavía no confirmó');
 expect(spy.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>(init?.headers as any)['X-Idempotency-Key'])).toEqual(['TEST-REFUND-refund','TEST-REFUND-refund']);
});
