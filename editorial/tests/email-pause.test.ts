import {it,expect} from 'vitest';
import {database} from './db';
import {processOutbox} from '../api/emails';
import type {Env} from '../api/types';
it('preserves queued mail and retry counts while production sending is disabled',async()=>{
 const {db,sqlite}=database();
 sqlite.exec("INSERT INTO outbox(id,recipient,kind,payload) VALUES('pause-test','test@example.com','received','{}')");
 expect(await processOutbox({DB:db,MODE:'production',EMAIL_ENABLED:'false'} as Env)).toBe(0);
 expect(sqlite.prepare("SELECT status,attempts FROM outbox WHERE id='pause-test'").get()).toMatchObject({status:'pending',attempts:0});sqlite.close();
});
