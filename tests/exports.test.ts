import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { fixture } from './harness';
import { cairoDate } from '../server/common';

async function sheetOf(result:any){
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(result.data,'base64') as any);
 return workbook.worksheets[0]!;
}
function field(sheet:ExcelJS.Worksheet,key:string,row=6){
 const columns=sheet.getRow(5).values as any[];
 const index=columns.indexOf(key);assert(index>0,`Missing column ${key}`);
 return sheet.getCell(row,index);
}

test('actual XLSX exports numeric quantities, complete merged metadata and scoped prices',async()=>{
 const f=await fixture();try{
  await f.post('receipt','10',{}, {unit_cost:'123.45'});await f.post('issue','3');
  const output=await f.app.read(f.admin,'exports/balances',{warehouse_id:f.w.id}),sheet=await sheetOf(output);
  assert.equal(field(sheet,'quantity').value,7);assert.equal(field(sheet,'reserved').value,0);
  assert.equal(field(sheet,'available').value,7);assert.equal(field(sheet,'value').value,864.15);
  assert.equal(field(sheet,'quantity').type,ExcelJS.ValueType.Number);
  for(const row of [1,2,3,4])assert.equal(sheet.getCell(row,sheet.columnCount).master.address,`A${row}`);
  assert((sheet.getRow(1).height||0)>=36);assert.match(String(sheet.getCell('A2').value),/القاهرة/);
  assert.match(String(sheet.getCell('A4').value),/15/);assert(output.filename.includes(cairoDate()));
  await f.write('roles',{id:'export-reader-qa',name:'Export reader',permissions:['catalog.read','stock.read','reports']});
  const u=await f.write('users',{username:'export-qa',display_name:'Export QA',password:'TEST-only-export-password-4821',role_id:'export-reader-qa',warehouse_ids:[f.w.id],department_ids:[f.dep.id]});
  const actor=await f.app.auth.actor(f.db,u.id),restricted=await sheetOf(await f.app.read(actor,'exports/balances',{}));
  assert(!((restricted.getRow(5).values as any[]).includes('value')));assert.equal(field(restricted,'quantity').value,7);
 }finally{await f.db.close();}
});

test('actual ledger export retains precise decimals as text and escapes formula-like names',async()=>{
 const f=await fixture();try{
  const category=(await f.app.catalog.list(f.db,f.admin,'categories')).find((c:any)=>c.parent_id);
  const item=await f.write('items',{sku:'00123',name_ar:'=2+2',category_id:category.id,base_unit:'Piece',precision:0,tracking:'consumable'});
  await f.post('receipt','1',{}, {item_id:item.id,unit_cost:'1234567.123456789'});
  const sheet=await sheetOf(await f.app.read(f.admin,'exports/ledger',{}));
  assert.equal(field(sheet,'unit_cost').value,'1234567.123456789');assert.equal(field(sheet,'unit_cost').numFmt,'@');
  assert(field(sheet,'unit_cost').note);assert.equal(field(sheet,'sku').value,'00123');
  assert.equal(field(sheet,'name_ar').value,"'=2+2");assert.equal(field(sheet,'name_ar').type,ExcelJS.ValueType.String);
  const empty=await sheetOf(await f.app.read(f.admin,'exports/custody',{}));
  assert.equal(empty.getCell('D1').master.address,'A1');assert.equal(empty.getCell('A6').value,'لا توجد بيانات');
 }finally{await f.db.close();}
});
