import test from 'node:test';import assert from 'node:assert/strict';
import { fixture } from './harness';import { randomUUID } from '../server/common';
test('receipt 10, issue 3; retry is idempotent and changed payload rejects',async()=>{
 const f=await fixture();try{
  await f.post('receipt','10',{}, {unit_cost:'100'});
  let d=await f.write('documents',f.draft('issue','3'));d=await f.write(`documents/${d.id}/submit`,{version:d.version});const key=randomUUID(),path=`documents/${d.id}/post`,body={version:d.version};
  const first=await f.write(path,body,f.admin,key),again=await f.write(path,body,f.admin,key);assert.equal(again.id,first.id);
  await assert.rejects(()=>f.write(path,{version:999},f.admin,key),/محتوى مختلف/);
  assert.equal((await f.app.catalog.item(f.db,f.admin,f.item.id)).positions[0].quantity,'7.000000');
  await assert.rejects(()=>f.db.query('UPDATE ledger SET quantity=0'),/append-only/);
 }finally{await f.db.close();}
});
test('two queued issues of 7 against 10: only one posts; no negative stock',async()=>{
 const f=await fixture();try{
  await f.post('receipt','10');let a=await f.write('documents',f.draft('issue','7')),b=await f.write('documents',f.draft('issue','7'));
  a=await f.write(`documents/${a.id}/submit`,{version:a.version});b=await f.write(`documents/${b.id}/submit`,{version:b.version});
  const results=await Promise.allSettled([a,b].map(d=>f.write(`documents/${d.id}/post`,{version:d.version})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.app.catalog.item(f.db,f.admin,f.item.id)).positions[0].quantity,'3.000000');
 }finally{await f.db.close();}
});
test('weighted average and cost visibility enforced in API-shaped objects',async()=>{
 const f=await fixture();try{
  await f.post('receipt','10',{}, {unit_cost:'100'});await f.post('receipt','10',{}, {unit_cost:'120'});
  const d=await f.post('issue','5');assert.equal(d.lines[0].posted_unit_cost,'110.000000000');
  const actor={...f.admin,permissions:['catalog.read','stock.read','reports'],all_warehouses:false,warehouse_ids:[f.w.id]};
  const visible=await f.app.catalog.item(f.db,actor,f.item.id);assert.equal(visible.costs,undefined);
  const doc=await f.app.stock.get(f.db,actor,d.id);assert.equal(doc.lines[0].posted_unit_cost,undefined);assert.equal(doc.lines[0].unit_cost,undefined);
  const balance=await f.app.report(f.db,actor,'balances',{});assert.equal(balance[0].value,undefined);
 }finally{await f.db.close();}
});
test('quality, reservation, scope and precision gates are server-side',async()=>{
 const f=await fixture();try{
  await f.post('receipt','10',{}, {quality:'Under Inspection'});
  await assert.rejects(()=>f.post('issue','1',{}, {quality:'Under Inspection'}),/غير مقبول/);
  await f.post('quality','10',{}, {quality:'Under Inspection',destination_quality:'Accepted'});
  await f.post('reserve','8');await assert.rejects(()=>f.post('issue','3'),/غير كافية/);
  await assert.rejects(()=>f.write('documents',f.draft('issue','1.5')),/دقة/);
  await assert.rejects(()=>f.app.stock.list(f.db,{...f.admin,all_warehouses:false,warehouse_ids:[]},{warehouse_id:f.w.id}),/نطاق/);
 }finally{await f.db.close();}
});
test('transfer preserves company quantities and is not an issue',async()=>{
 const f=await fixture();try{
  const destination=await f.write('warehouses',{name:'Fixture Destination'});await f.post('receipt','10',{}, {unit_cost:'100'});
  await f.post('transfer','4',{destination_warehouse_id:destination.id});
  const item=await f.app.catalog.item(f.db,f.admin,f.item.id);assert.equal(item.positions.length,2);assert.equal(item.costs.quantity,'10.000000');assert.equal(item.costs.value,'1000.000000000');
 }finally{await f.db.close();}
});
