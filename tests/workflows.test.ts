import test from 'node:test';import assert from 'node:assert/strict';import{fixture}from './harness';
test('partial purchase receipts cannot exceed purchase line; warehouse count freezes movement then posts approved differences',async()=>{
 const f=await fixture();try{
  const supplier=await f.write('masters',{kind:'supplier',name:'Fixture Supplier'});
  let po=await f.write('purchase-orders',{supplier_id:supplier.id,warehouse_id:f.w.id,lines:[{item_id:f.item.id,quantity:'10',unit:'Piece',unit_price:'100'}]});
  po=await f.write(`purchase-orders/${po.id}/submit`,{version:po.version});po=await f.write(`purchase-orders/${po.id}/approve`,{version:po.version});
  await f.post('receipt','6',{supplier_id:supplier.id},{unit_cost:'100',purchase_line_id:po.lines[0].id});
  await assert.rejects(()=>f.post('receipt','5',{supplier_id:supplier.id},{unit_cost:'100',purchase_line_id:po.lines[0].id}),/المتبقي/);
  po=await f.app.workflows.read(f.db,f.admin,'purchase-orders',po.id);assert.equal(po.status,'Partial');assert.equal(po.lines[0].received,'6.000000');
  let count=await f.write('counts',{warehouse_id:f.w.id,reason:'Fixture stocktake'});
  await assert.rejects(()=>f.post('issue','1'),/جرد مفتوح/);
  count=await f.write(`counts/${count.id}/lines`,{version:count.version,lines:count.lines.map((l:any)=>({position_key:l.position_key,counted:'4'}))});
  count=await f.write(`counts/${count.id}/submit`,{version:count.version});
  await assert.rejects(()=>f.write(`counts/${count.id}/approve`,{version:count.version}),/مستخدم آخر/);
  const user=await f.write('users',{username:'approver',display_name:'Fixture Approver',password:'TEST-password-only-9911',role_id:'manager',warehouse_ids:[],department_ids:[],all_warehouses:true,all_departments:true});
  const approver=await f.app.auth.actor(f.db,user.id);count=await f.write(`counts/${count.id}/approve`,{version:count.version},approver);assert.equal(count.status,'Closed');
  assert.equal((await f.app.catalog.item(f.db,f.admin,f.item.id)).positions[0].quantity,'4.000000');
 }finally{await f.db.close();}
});
test('unknown-priced issue and partial returns retain exact valuation portions',async()=>{
 const f=await fixture();try{
  await f.post('receipt','10',{}, {unit_cost:'100'});await f.post('receipt','10');
  const issue=await f.post('issue','6');assert.equal(issue.lines[0].posted_unit_cost,null);assert.equal(issue.lines[0].posted_value,'-300.000000000');
  await f.post('return','2',{reference_id:issue.id},{reference_line_id:issue.lines[0].id});
  await f.post('return','4',{reference_id:issue.id},{reference_line_id:issue.lines[0].id});
  const c=(await f.app.catalog.item(f.db,f.admin,f.item.id)).costs;assert.equal(c.quantity,'20.000000');assert.equal(c.value,'1000.000000000');assert.equal(c.unpriced_quantity,'10.000000');
  await assert.rejects(()=>f.post('return','1',{reference_id:issue.id},{reference_line_id:issue.lines[0].id}),/المتبقي/);
 }finally{await f.db.close();}
});
test('duplicate original return lines within one draft do not exceed original',async()=>{
 const f=await fixture();try{await f.post('receipt','10');const source=await f.post('issue','3');const line={item_id:f.item.id,quantity:'2',unit:'Piece',reference_line_id:source.lines[0].id};
  let d=await f.write('documents',f.draft('return','2',{reference_id:source.id,lines:[line,line]}));d=await f.write(`documents/${d.id}/submit`,{version:d.version});await assert.rejects(()=>f.write(`documents/${d.id}/post`,{version:d.version}),/المتبقي/);
  assert.equal((await f.app.catalog.item(f.db,f.admin,f.item.id)).positions[0].quantity,'7.000000');
 }finally{await f.db.close();}
});
test('XLSX server export contains only authorized scoped report fields',async()=>{
 const f=await fixture();try{await f.post('receipt','10',{}, {unit_cost:'123.45'});
  await f.write('roles',{id:'export-reader',name:'Fixture export reader',permissions:['catalog.read','stock.read','reports']});
  const user=await f.write('users',{username:'export-reader',display_name:'Fixture export reader',password:'TEST-only-export-password-4821',role_id:'export-reader',warehouse_ids:[f.w.id],department_ids:[f.dep.id]});const a=await f.app.auth.actor(f.db,user.id);
  const exported=await f.app.read(a,'exports/balances',{});assert.match(exported.filename,/xlsx$/);assert.equal(Buffer.from(exported.data,'base64').subarray(0,2).toString(),'PK');
  const ExcelJS=await import('exceljs');const workbook=new ExcelJS.default.Workbook();await workbook.xlsx.load(Buffer.from(exported.data,'base64') as any);
  const headings=workbook.worksheets[0]!.getRow(5).values as any[];assert.ok(!headings.includes('value'));assert.ok(headings.includes('base_unit'));
 }finally{await f.db.close();}
});
