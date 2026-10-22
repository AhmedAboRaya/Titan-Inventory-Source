import test from 'node:test';import assert from 'node:assert/strict';
import { postgresFixture,lockQueue,waitForBlocked } from './postgres-harness';
import { randomUUID,hash,passwordHash } from '../server/common';
import {Passkeys}from '../server/passkeys';
import {Postgres,migrate}from '../server/db';import{seed}from'../server/seed';import{Auth}from'../server/auth';
import {createRequire} from 'node:module';import{resolve}from'node:path';import{readFile,writeFile}from'node:fs/promises';
const {backup,restoreCheck}=createRequire(import.meta.url)('../deploy/backup.cjs');
const setup=postgresFixture;
test('real PostgreSQL connections use Cairo day boundaries and preserve DATE strings',async()=>{
 const f=await setup();try{
  assert.equal((await f.db.query('SHOW TimeZone')).rows[0].TimeZone,'Africa/Cairo');
  const row=(await f.db.query("SELECT ('2026-07-01T21:30:00Z'::timestamptz)::date AS summer, ('2026-01-15T21:30:00Z'::timestamptz)::date AS winter, '2026-10-18'::date AS document_date")).rows[0];
  assert.deepEqual(row,{summer:'2026-07-02',winter:'2026-01-15',document_date:'2026-10-18'});
 }finally{await f.close();}
});
test('real multi-session requests: two issues of 7 against 10 allow exactly one',async()=>{
 const f=await setup();try{await f.post('receipt','10');let a=await f.write('documents',f.draft('issue','7')),b=await f.write('documents',f.draft('issue','7'));a=await f.write(`documents/${a.id}/submit`,{version:a.version});b=await f.write(`documents/${b.id}/submit`,{version:b.version});
 const gate=await lockQueue(f);const jobs=[a,b].map(d=>f.write(`documents/${d.id}/post`,{version:d.version}));const results=Promise.allSettled(jobs);await waitForBlocked(f,2);await gate.release();const settled=await results;assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.app.catalog.item(f.db,f.admin,f.item.id)).positions[0].quantity,'3.000000');
 }finally{await f.close();}
});
test('permissions and activation are rechecked after a request waits for the write lock',async()=>{
 const f=await setup();try{const actor=await f.role(['stock.read','catalog.read','receipt']);const gate=await lockQueue(f);const result=f.write('documents',f.draft('receipt','1'),actor).then(()=>null,e=>e);await waitForBlocked(f,1);await gate.client.query('UPDATE roles SET permissions=$2 WHERE id=$1',[actor.role_id,['stock.read','catalog.read']]);await gate.release();assert.equal((await result)?.code,'FORBIDDEN');assert.equal((await f.db.query('SELECT count(*)::int n FROM documents')).rows[0].n,0);
 const gate2=await lockQueue(f);const denied=f.write('documents',f.draft('receipt','1'),actor).then(()=>null,e=>e);await waitForBlocked(f,1);await gate2.client.query('UPDATE users SET active=false WHERE id=$1',[actor.id]);await gate2.release();assert.equal((await denied)?.code,'SESSION');
 }finally{await f.close();}
});
test('idempotency keys are scoped by user and replay is denied after scope revocation',async()=>{
 const f=await setup();try{const actor=await f.role(['stock.read','catalog.read','receipt']);const key=randomUUID(),body=f.draft('receipt','1');const first=await f.write('documents',body,f.admin,key),second=await f.write('documents',body,actor,key);assert.notEqual(first.id,second.id);assert.equal((await f.write('documents',body,actor,key)).id,second.id);await f.db.query("UPDATE users SET warehouse_ids='{}',version=version+1 WHERE id=$1",[actor.id]);await assert.rejects(()=>f.write('documents',body,actor,key),(e:any)=>e.status===403);assert.equal((await f.db.query('SELECT count(*)::int n FROM documents')).rows[0].n,2);
 }finally{await f.close();}
});
test('real PostgreSQL DATE honors closed accounting periods',async()=>{
 const f=await setup();try{await f.db.query("INSERT INTO settings(key,value) VALUES('closed_period',$1)",[JSON.stringify({through:'2026-10-18'})]);await assert.rejects(()=>f.post('receipt','1'),(e:any)=>e.code==='CLOSED');assert.equal((await f.db.query('SELECT count(*)::int n FROM ledger')).rows[0].n,0);
 }finally{await f.close();}
});
test('weighted average, full-coverage return and reversal preserve values exactly',async()=>{
 const f=await setup();try{await f.post('receipt','10',{}, {unit_cost:'100'});await f.post('receipt','10',{}, {unit_cost:'120'});const issue=await f.post('issue','5');assert.equal(issue.lines[0].posted_unit_cost,'110.000000000');const ret=await f.post('return','2',{reference_id:issue.id},{reference_line_id:issue.lines[0].id});let c=(await f.app.catalog.item(f.db,f.admin,f.item.id)).costs;assert.equal(c.quantity,'17.000000');assert.equal(c.value,'1870.000000000');await f.finish(await f.write(`documents/${ret.id}/reverse`,{reason:'Test inverse',version:ret.version}));await f.finish(await f.write(`documents/${issue.id}/reverse`,{reason:'Test inverse',version:issue.version}));c=(await f.app.catalog.item(f.db,f.admin,f.item.id)).costs;assert.equal(c.quantity,'20.000000');assert.equal(c.value,'2200.000000000');
 }finally{await f.close();}
});
test('mixed priced/unpriced return and reversal restore both valuation portions',async()=>{
 const f=await setup();try{await f.post('receipt','10',{}, {unit_cost:'100'});await f.post('receipt','10');const issue=await f.post('issue','4');let c=(await f.app.catalog.item(f.db,f.admin,f.item.id)).costs;assert.equal(c.quantity,'16.000000');assert.equal(c.value,'800.000000000');assert.equal(c.unpriced_quantity,'8.000000');const ret=await f.post('return','2',{reference_id:issue.id},{reference_line_id:issue.lines[0].id});c=(await f.app.catalog.item(f.db,f.admin,f.item.id)).costs;assert.equal(c.value,'900.000000000');assert.equal(c.unpriced_quantity,'9.000000');await f.finish(await f.write(`documents/${ret.id}/reverse`,{reason:'Test inverse',version:ret.version}));await f.finish(await f.write(`documents/${issue.id}/reverse`,{reason:'Test inverse',version:issue.version}));c=(await f.app.catalog.item(f.db,f.admin,f.item.id)).costs;assert.equal(c.quantity,'20.000000');assert.equal(c.value,'1000.000000000');assert.equal(c.unpriced_quantity,'10.000000');
 }finally{await f.close();}
});
test('scoped reports and cost summaries do not disclose other warehouse totals',async()=>{
 const f=await setup();try{const w2=await f.write('warehouses',{name:'Hidden Warehouse'});await f.post('receipt','10',{}, {unit_cost:'100'});await f.post('receipt','90',{warehouse_id:w2.id}, {unit_cost:'100'});const scoped=await f.role(['catalog.read','stock.read','cost.read','reports']);const item=await f.app.catalog.item(f.db,scoped,f.item.id);assert.equal(item.positions.length,1);assert.equal(item.costs.quantity,'10.000000');assert.equal(item.costs.value,'1000.000000000');const report=await f.app.report(f.db,scoped,'balances',{});assert.equal(report.length,1);assert.equal(report[0].warehouse_id,f.w.id);const noCost={...scoped,permissions:scoped.permissions.filter(p=>p!=='cost.read')};assert.equal((await f.app.catalog.item(f.db,noCost,f.item.id)).costs,undefined);assert.equal((await f.app.report(f.db,noCost,'balances',{}))[0].value,undefined);await assert.rejects(()=>f.app.report(f.db,scoped,'ledger',{warehouse_id:w2.id}),(e:any)=>e.code==='SCOPE');
 }finally{await f.close();}
});
test('SQL constraints protect posted lines against insert/update/delete and ledger/audit mutation',async()=>{
 const f=await setup();try{const d=await f.post('receipt','2');await assert.rejects(()=>f.db.query('UPDATE document_lines SET quantity=1 WHERE document_id=$1',[d.id]),/immutable/);await assert.rejects(()=>f.db.query('DELETE FROM document_lines WHERE document_id=$1',[d.id]),/immutable/);await assert.rejects(()=>f.db.query("INSERT INTO document_lines(document_id,item_id,quantity,unit,factor,base_quantity,quality,condition) VALUES($1,$2,1,'Piece',1,1,'Accepted','New')",[d.id,f.item.id]),/immutable/);await assert.rejects(()=>f.db.query('UPDATE ledger SET quantity=0'),/append-only/);await assert.rejects(()=>f.db.query('DELETE FROM audit'),/append-only/);await assert.rejects(()=>f.db.query('UPDATE balances SET quantity=-1'),/check constraint/);assert.equal((await f.db.query('SELECT count(*)::int n FROM ledger')).rows[0].n,1);
 }finally{await f.close();}
});
test('duplicate return references in one document cannot exceed the original quantity',async()=>{
 const f=await setup();try{await f.post('receipt','10');const issue=await f.post('issue','4'),line={item_id:f.item.id,quantity:'3',unit:'Piece',reference_line_id:issue.lines[0].id};const d=await f.write('documents',f.draft('return','3',{reference_id:issue.id,lines:[line,{...line}]}));await assert.rejects(()=>f.finish(d),(e:any)=>e.code==='REFERENCE_LIMIT');assert.equal((await f.app.catalog.item(f.db,f.admin,f.item.id)).positions[0].quantity,'6.000000');
 }finally{await f.close();}
});
test('transfer and reservation preserve value, block unavailable issues, and release restores availability',async()=>{
 const f=await setup();try{const destination=await f.write('warehouses',{name:'Destination'});await f.post('receipt','10',{}, {unit_cost:'12.5'});await f.post('transfer','4',{destination_warehouse_id:destination.id});const reserve=await f.post('reserve','5');await assert.rejects(()=>f.post('issue','2'),(e:any)=>e.code==='STOCK');await f.post('release','3',{reference_id:reserve.id},{reference_line_id:reserve.lines[0].id});await f.post('issue','2');const item=await f.app.catalog.item(f.db,f.admin,f.item.id);assert.equal(item.costs.quantity,'8.000000');assert.equal(item.costs.value,'100.000000000');assert.equal(item.positions.find((p:any)=>p.warehouse_id===f.w.id).reserved,'2.000000');
 }finally{await f.close();}
});

test('consistent PostgreSQL backup restores all table fingerprints and attachment bytes into a fresh local database',async()=>{
 const f=await setup();try{await f.post('receipt','3',{}, {unit_cost:'14.5'});await f.write('attachments',{item_id:f.item.id,filename:'synthetic.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7\nSynthetic fixture only\n%%EOF').toString('base64')});
 const directory=resolve('.local','backup-'+randomUUID()),bin=process.env.PG_BIN;
 const result=await backup({url:f.testURL,bin,output:directory,attachments:f.attachmentRoot});assert.equal(result.ok,true);assert.equal(result.attachmentFiles,1);
 const restored=await restoreCheck({url:f.clusterURL,bin,directory});assert.equal(restored.ok,true);assert.equal(restored.restoredIntoNewDatabase,true);
 await assert.rejects(()=>backup({url:f.testURL,bin,output:directory,attachments:f.attachmentRoot}),/already exists/);
 const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));await writeFile(resolve(directory,'attachments',manifest.attachments[0].path),'tampered');
 await assert.rejects(()=>restoreCheck({url:f.clusterURL,bin,directory}),/integrity mismatch/);await assert.rejects(()=>restoreCheck({url:f.testURL,bin,directory}),/isolated loopback/);
 }finally{await f.close();}
});

test('password reset wins against an already verified login waiting on the transaction lock',async()=>{
 const f=await setup();try{const gate=await lockQueue(f);const pending=f.app.auth.login({username:'admin',password:'TEST-only-password-4821'},'test-loopback').then(()=>null,e=>e);await waitForBlocked(f,1);await gate.client.query('UPDATE users SET password_hash=$2,version=version+1 WHERE id=$1',[f.admin.id,await passwordHash('NEW-test-password-45678')]);await gate.release();assert.equal((await pending)?.status,401);assert.equal((await f.db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,0);
 }finally{await f.close();}
});

test('passkey registration options, verify, and revocation recheck a session revoked while queued',async()=>{
 const f=await setup();try{const keys=new Passkeys(f.db,f.app.auth,'https://example.invalid');for(const action of ['options','register','revoke']){const login=await f.app.auth.login({username:'admin',password:'TEST-only-password-4821'},'test-loopback'),session=hash(login.raw),gate=await lockQueue(f);const pending=(action==='options'?keys.options(f.admin,session):action==='register'?keys.register(f.admin,{challenge_id:randomUUID(),response:{}},session):keys.revoke(f.admin,{id:'synthetic-credential'},session)).then(()=>null,e=>e);await waitForBlocked(f,1);await gate.client.query('UPDATE sessions SET revoked=true WHERE token_hash=$1',[session]);await gate.release();assert.equal((await pending)?.code,'SESSION',action);}
 assert.equal((await f.db.query('SELECT count(*)::int n FROM passkeys')).rows[0].n,0);
 }finally{await f.close();}
});

test('item attachment lists and gallery image IDs exclude documents outside warehouse and department scope',async()=>{
 const f=await setup();try{const w2=await f.write('warehouses',{name:'Hidden warehouse'}),dep2=await f.write('masters',{kind:'department',name:'Hidden department'}),actor=await f.role(['catalog.read']);
 for(const scope of [{warehouse_id:w2.id},{department_id:dep2.id}]){const doc=await f.write('documents',f.draft('receipt','1',scope)),body={item_id:f.item.id,document_id:doc.id,filename:'private-fixture.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7\nPrivate synthetic fixture\n%%EOF').toString('base64')};await assert.rejects(()=>f.write('attachments',{...body,primary_image:true}),(e:any)=>e.code==='PRIMARY_IMAGE');const file=await f.write('attachments',body);await f.db.query('UPDATE attachments SET primary_image=true WHERE id=$1',[file.id]);assert.deepEqual(await f.app.attachments.read(f.db,actor,undefined,{item_id:f.item.id}),[]);await assert.rejects(()=>f.app.attachments.read(f.db,actor,file.id,{}),(e:any)=>e.code==='SCOPE');}
 const item=(await f.app.catalog.list(f.db,actor,'items')).find((i:any)=>i.id===f.item.id);assert.equal(item.image_id,null);
 }finally{await f.close();}
});

test('delegated user administration cannot change a higher privilege or out-of-scope account',async()=>{
 const f=await setup();try{const actor=await f.role(['users','catalog.read']);const body={username:f.approver.username,display_name:'Unauthorized change',role_id:actor.role_id,password:'TEST-takeover-denied-4821',warehouse_ids:[f.w.id],department_ids:[f.dep.id],version:f.approver.version};await assert.rejects(()=>f.write('users/'+f.approver.id,body,actor),(e:any)=>e.status===403);assert.equal((await f.app.auth.actor(f.db,f.approver.id)).role_id,'admin');
 }finally{await f.close();}
});

test('posting a saved return rechecks revoked original-document scope and warehouse filters keep transfers visible',async()=>{
 const f=await setup();try{const w2=await f.write('warehouses',{name:'Return destination'});await f.post('receipt','10');const original=await f.post('issue','4'),actor=await f.role(['catalog.read','stock.read','issue'],[f.w.id,w2.id]);let ret=await f.write('documents',f.draft('return','2',{warehouse_id:w2.id,reference_id:original.id},{reference_line_id:original.lines[0].id}),actor);ret=await f.write(`documents/${ret.id}/submit`,{version:ret.version},actor);await f.db.query('UPDATE users SET warehouse_ids=$2,version=version+1 WHERE id=$1',[actor.id,[w2.id]]);await assert.rejects(()=>f.write(`documents/${ret.id}/post`,{version:ret.version},actor),(e:any)=>e.code==='SCOPE');assert.equal((await f.app.stock.get(f.db,f.admin,ret.id)).status,'Submitted');
 const transfer=await f.post('transfer','1',{destination_warehouse_id:w2.id});for(const warehouse_id of [f.w.id,w2.id])assert((await f.app.stock.list(f.db,f.admin,{warehouse_id})).some((d:any)=>d.id===transfer.id));
 }finally{await f.close();}
});

test('first-administrator setup requires the operator token and concurrent setup cannot replace an existing account',async()=>{
 const f=await setup(),name='inv_test_setup_'+randomUUID().replaceAll('-','');let db:Postgres|undefined,created=false;try{await f.control.query('CREATE DATABASE '+name);created=true;const url=new URL(f.clusterURL);url.pathname='/'+name;db=new Postgres(url.href);await migrate(db);await seed(db);const auth=new Auth(db),setupToken='synthetic-private-setup-token-'+randomUUID(),body={username:'first-admin',display_name:'First fixture administrator',password:'Synthetic-only-setup-password-4821',setup_token:setupToken};await assert.rejects(()=>auth.setup({...body,setup_token:'wrong-synthetic-token-48214821'},hash(setupToken)),(e:any)=>e.code==='SETUP_TOKEN');assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,0);
 const results=await Promise.allSettled([auth.setup(body,hash(setupToken)),auth.setup({...body,username:'second-admin'},hash(setupToken))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((results.find(r=>r.status==='rejected')as PromiseRejectedResult).reason.code,'INITIALIZED');assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM balances')).rows[0].n,0);
 }finally{if(db)await db.close();if(created)await f.control.query('DROP DATABASE '+name);await f.close();}
});
