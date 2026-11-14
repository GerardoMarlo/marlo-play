import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const sql=fs.readFileSync(process.argv[2] || new URL('../.wrangler/pre-postal-import-20261019.sql',import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');
try{
 db.exec(sql);
 const integrity=db.prepare('PRAGMA integrity_check').get();
 const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
 const counts=Object.fromEntries(['orders','products','outbox','sandbox_webhook_events'].map(table=>[table,db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n]));
 if(integrity.integrity_check!=='ok'||foreignKeys.length)throw Error('Backup integrity failed');
 console.log(JSON.stringify({isolatedRestore:true,productionModified:false,integrity:'ok',foreignKeyViolations:foreignKeys.length,counts}));
}finally{db.close();}
