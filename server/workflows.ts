import {SQL,one}from './db';
import{Actor,permit,warehouse,fail,z,uuid,text,decimal,qty,date,nullableId,Decimal,json,visible,hash,cairoDate}from './common';
import{Stock}from './stock';import{Catalog,units}from './catalog';
export class Workflows{
 constructor(readonly stock:Stock,readonly catalog:Catalog){}
 async read(tx:SQL,a:Actor,kind:string,id?:string,q:Record<string,string>={}){
  const scope=a.all_warehouses?null:a.warehouse_ids;
  if(kind==='purchase-orders'){
   permit(a,'purchase');const rows=(await tx.query(`SELECT p.*,m.name supplier_name,w.name warehouse_name FROM purchase_orders p JOIN masters m ON m.id=p.supplier_id JOIN warehouses w ON w.id=p.warehouse_id WHERE ($1::uuid[] IS NULL OR p.warehouse_id=ANY($1)) AND ($2::uuid IS NULL OR p.id=$2) ORDER BY p.id DESC LIMIT 100`,[scope,id?uuid.parse(id):null])).rows;
   if(id){if(!rows[0])fail('NOT_FOUND','أمر الشراء غير موجود',404);rows[0].lines=(await tx.query('SELECT p.*,i.sku,i.name_ar FROM purchase_lines p JOIN items i ON i.id=p.item_id WHERE order_id=$1',[id])).rows;return visible(rows[0],a);}return visible(rows,a);
  }
  if(kind==='counts'){
   permit(a,'count');const rows=(await tx.query('SELECT c.*,w.name warehouse_name FROM inventory_counts c JOIN warehouses w ON w.id=c.warehouse_id WHERE ($1::uuid[] IS NULL OR c.warehouse_id=ANY($1)) AND ($2::uuid IS NULL OR c.id=$2) ORDER BY c.created_at DESC LIMIT 100',[scope,id?uuid.parse(id):null])).rows;
   if(id){if(!rows[0])fail('NOT_FOUND','الجرد غير موجود',404);rows[0].lines=(await tx.query(`SELECT c.*,b.item_id,b.location_id,b.lot_id,b.serial_id,b.quality,b.condition,i.sku,i.name_ar,i.base_unit,l.name location_name,lot.code lot_code FROM count_lines c JOIN balances b ON b.position_key=c.position_key JOIN items i ON i.id=b.item_id LEFT JOIN locations l ON l.id=b.location_id LEFT JOIN lots lot ON lot.id=b.lot_id WHERE c.count_id=$1 ORDER BY i.sku`,[id])).rows;return rows[0];}return rows;
  }
  if(kind==='imports'){permit(a,'import');return(await tx.query('SELECT id,source,status,created_by,approved_by,created_at'+(id?',rows':'')+' FROM imports WHERE ($1::uuid IS NULL OR id=$1) ORDER BY created_at DESC LIMIT 100',[id?uuid.parse(id):null])).rows;}
  fail('NOT_FOUND','المسار غير موجود',404);
 }
 async mutate(tx:SQL,a:Actor,kind:string,id:string|undefined,action:string|undefined,body:unknown){
  if(kind==='purchase-orders')return this.purchase(tx,a,id,action,body);
  if(kind==='counts')return this.count(tx,a,id,action,body);
  if(kind==='imports')return this.imports(tx,a,id,action,body);
  if(kind==='serials'){
   permit(a,'catalog.write');const b=z.object({item_id:uuid,serial:text}).strict().parse(body);
   if(!await one(tx,'SELECT 1 FROM items WHERE id=$1 AND track_serial AND active',[b.item_id]))fail('SERIAL','الصنف لا يتتبع سيريال');
   return(await tx.query('INSERT INTO serials(item_id,serial) VALUES($1,$2) RETURNING id',[b.item_id,b.serial])).rows[0];
  }
  if(kind==='item-levels'){
   permit(a,'catalog.write');const b=z.object({item_id:uuid,warehouse_id:uuid,minimum:decimal,reorder:decimal,target:decimal}).strict().parse(body);warehouse(a,b.warehouse_id);
   if(new Decimal(b.target).lt(b.reorder)||new Decimal(b.reorder).lt(b.minimum))fail('LEVELS','يجب أن يكون المستهدف ≥ إعادة الطلب ≥ الحد الأدنى');
   await tx.query('INSERT INTO item_levels(item_id,warehouse_id,minimum,reorder,target) VALUES($1,$2,$3,$4,$5) ON CONFLICT(item_id,warehouse_id) DO UPDATE SET minimum=$3,reorder=$4,target=$5',[b.item_id,b.warehouse_id,b.minimum,b.reorder,b.target]);return{ok:true};
  }
  if(kind==='item-codes'){
   permit(a,'catalog.write');const b=z.object({item_id:uuid,code:text,kind:z.enum(['legacy','supplier','barcode']),supplier_id:nullableId}).strict().parse(body);
   await tx.query('INSERT INTO item_codes(item_id,code,kind,supplier_id) VALUES($1,$2,$3,$4)',[b.item_id,b.code,b.kind,b.supplier_id||null]);return{ok:true};
  }
  if(kind==='settings'){
   permit(a,'settings');const b=z.object({closed_through:date,reason:text}).strict().parse(body);
   const old=await one(tx,"SELECT value FROM settings WHERE key='closed_period'");if(old?.value?.through>b.closed_through)fail('CLOSED','لا يمكن إعادة فتح فترة من هذه الشاشة');
   await tx.query("INSERT INTO settings(key,value) VALUES('closed_period',$1) ON CONFLICT(key) DO UPDATE SET value=$1",[json({through:b.closed_through,reason:b.reason,by:a.id})]);
   await tx.query("INSERT INTO audit(user_id,action,target,detail) VALUES($1,'period.close',$2,$3)",[a.id,b.closed_through,json({reason:b.reason})]);return{ok:true};
  }
  fail('NOT_FOUND','غير موجود',404);
 }
 private async purchase(tx:SQL,a:Actor,id:string|undefined,action:string|undefined,body:unknown){
  permit(a,'purchase');
  if(!id){
   const b=z.object({supplier_id:uuid,warehouse_id:uuid,currency:z.enum(['EGP','USD','EUR']).default('EGP'),expected_on:date.nullable().optional(),lines:z.array(z.object({item_id:uuid,quantity:qty,unit:text,unit_price:decimal.nullable().optional()}).strict()).min(1).max(100)}).strict().parse(body);warehouse(a,b.warehouse_id);
   if(!await one(tx,"SELECT 1 FROM masters WHERE id=$1 AND kind='supplier' AND active",[b.supplier_id]))fail('SUPPLIER','المورد غير فعال');
   for(const l of b.lines){const item=await one(tx,'SELECT * FROM items WHERE id=$1 AND active',[l.item_id]);if(!item)fail('ITEM','الصنف غير فعال');if(item.base_unit!==l.unit&&!await one(tx,'SELECT 1 FROM conversions WHERE item_id=$1 AND unit=$2',[l.item_id,l.unit]))fail('UNIT','وحدة شراء غير معتمدة');if(l.unit_price!=null)permit(a,'cost.read');}
   id=(await tx.query('INSERT INTO purchase_orders(supplier_id,warehouse_id,currency,expected_on,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.supplier_id,b.warehouse_id,b.currency,b.expected_on||null,a.id])).rows[0].id;
   for(const l of b.lines)await tx.query('INSERT INTO purchase_lines(order_id,item_id,quantity,unit,unit_price) VALUES($1,$2,$3,$4,$5)',[id,l.item_id,l.quantity,l.unit,l.unit_price??null]);
  }else{
   const order=await one(tx,'SELECT * FROM purchase_orders WHERE id=$1',[uuid.parse(id)]);if(!order)fail('NOT_FOUND','أمر الشراء غير موجود',404);warehouse(a,order.warehouse_id);
   const b=z.object({version:z.number().int().positive()}).strict().parse(body);if(order.version!==b.version)fail('CONFLICT','أمر الشراء تغير',409);
   if(action==='submit'){if(order.status!=='Draft')fail('STATE','الأمر ليس مسودة');await tx.query("UPDATE purchase_orders SET status='Submitted',version=version+1 WHERE id=$1",[id]);}
   else if(action==='approve'){permit(a,'approve');if(order.status!=='Submitted')fail('STATE','قدم الأمر أولًا');await tx.query("UPDATE purchase_orders SET status='Approved',version=version+1 WHERE id=$1",[id]);}
   else if(action==='cancel'){if(!['Draft','Submitted','Approved'].includes(order.status))fail('STATE','أمر الشراء مستلم أو مستلم جزئيًا');await tx.query("UPDATE purchase_orders SET status='Cancelled',version=version+1 WHERE id=$1",[id]);}
   else fail('ACTION','إجراء غير معروف');
  }
  await tx.query("INSERT INTO audit(user_id,action,target) VALUES($1,'purchase.'||$2,$3)",[a.id,action||'create',id]);return this.read(tx,a,'purchase-orders',id);
 }
 private async count(tx:SQL,a:Actor,id:string|undefined,action:string|undefined,body:unknown){
  permit(a,'count');
  if(!id){
   const b=z.object({warehouse_id:uuid,reason:text}).strict().parse(body);warehouse(a,b.warehouse_id);
   id=(await tx.query('INSERT INTO inventory_counts(warehouse_id,created_by,reason) VALUES($1,$2,$3) RETURNING id',[b.warehouse_id,a.id,b.reason])).rows[0].id;
   await tx.query('INSERT INTO count_lines(count_id,position_key,expected) SELECT $1,position_key,quantity FROM balances WHERE warehouse_id=$2 AND holder_id IS NULL AND transit_id IS NULL',[id,b.warehouse_id]);
  }else{
   const c=await one(tx,'SELECT * FROM inventory_counts WHERE id=$1',[uuid.parse(id)]);if(!c)fail('NOT_FOUND','الجرد غير موجود',404);warehouse(a,c.warehouse_id);
   if(action==='lines'){
    const b=z.object({version:z.number().int().positive(),lines:z.array(z.object({position_key:z.string().regex(/^[a-f0-9]{64}$/),counted:decimal,recounted:decimal.nullable().optional()}).strict()).max(1000)}).strict().parse(body);
    if(c.status!=='Open'||c.version!==b.version)fail('CONFLICT','الجرد تغير أو مغلق',409);
    for(const l of b.lines){const row=await one(tx,'SELECT cl.*,i.precision FROM count_lines cl JOIN balances b ON b.position_key=cl.position_key JOIN items i ON i.id=b.item_id WHERE cl.count_id=$1 AND cl.position_key=$2',[id,l.position_key]);if(!row)fail('LINE','بند الجرد غير موجود');for(const n of [l.counted,l.recounted].filter(v=>v!=null))if(new Decimal(n!).decimalPlaces()>row.precision)fail('PRECISION','دقة العد لا تناسب الوحدة');await tx.query('UPDATE count_lines SET counted=$3,recounted=$4 WHERE count_id=$1 AND position_key=$2',[id,l.position_key,l.counted,l.recounted??null]);}
    await tx.query('UPDATE inventory_counts SET version=version+1 WHERE id=$1',[id]);
   }else{
    const b=z.object({version:z.number().int().positive()}).strict().parse(body);if(c.version!==b.version)fail('CONFLICT','الجرد تغير',409);
    if(action==='submit'){
     if(c.status!=='Open')fail('STATE','الجرد ليس مفتوحًا');const lines=(await tx.query('SELECT c.*,b.*,i.base_unit FROM count_lines c JOIN balances b ON b.position_key=c.position_key JOIN items i ON i.id=b.item_id WHERE count_id=$1',[id])).rows;
     if(lines.some(l=>l.counted==null))fail('COUNT','أكمل العد لكل البنود');
     const ids:string[]=[];
     for(const type of ['adjustment_in','adjustment_out']){
      const selected=lines.map(l=>({...l,delta:new Decimal(l.recounted??l.counted).sub(l.expected)})).filter(l=>type==='adjustment_in'?l.delta.gt(0):l.delta.lt(0));
      if(!selected.length)continue;
      const d=await this.stock.save(tx,a,{type,document_date:cairoDate(),warehouse_id:c.warehouse_id,reason:'الجرد '+id+': '+c.reason,lines:selected.map(l=>({item_id:l.item_id,quantity:l.delta.abs().toFixed(6),unit:l.base_unit,location_id:l.location_id,lot_id:l.lot_id,serial_id:l.serial_id,quality:l.quality,condition:l.condition}))});
      await this.stock.action(tx,a,d.id,'submit',d.version);ids.push(d.id);
     }
     await tx.query("UPDATE inventory_counts SET status='Pending Approval',document_ids=$2,version=version+1 WHERE id=$1",[id,ids]);
    }else if(action==='approve'){
     permit(a,'approve');if(c.created_by===a.id)fail('SELF_APPROVAL','مستخدم آخر يجب أن يعتمد الجرد',403);if(c.status!=='Pending Approval')fail('STATE','الجرد لا ينتظر الاعتماد');
     await tx.query("UPDATE inventory_counts SET status='Closing' WHERE id=$1",[id]);
     for(const docId of c.document_ids){let d=await this.stock.get(tx,a,docId);d=await this.stock.action(tx,a,docId,'approve',d.version);await this.stock.action(tx,a,docId,'post',d.version);}
     await tx.query("UPDATE inventory_counts SET status='Closed',approved_by=$2,version=version+1 WHERE id=$1",[id,a.id]);
    }else if(action==='cancel'){
     if(!['Open','Pending Approval'].includes(c.status))fail('STATE','الجرد مغلق');if(c.created_by!==a.id)permit(a,'approve');
     for(const docId of c.document_ids){const d=await this.stock.get(tx,a,docId);await this.stock.action(tx,a,docId,'cancel',d.version);}
     await tx.query("UPDATE inventory_counts SET status='Cancelled',version=version+1 WHERE id=$1",[id]);
    }else fail('ACTION','إجراء غير معروف');
   }
  }
  await tx.query("INSERT INTO audit(user_id,action,target) VALUES($1,'count.'||$2,$3)",[a.id,action||'create',id]);return this.read(tx,a,'counts',id);
 }
 private async imports(tx:SQL,a:Actor,id:string|undefined,action:string|undefined,body:unknown){
  permit(a,'import');
  if(!id){
   const b=z.object({source:text,rows:z.array(z.object({source_row:z.number().int().positive(),original_text:z.string().max(4000),sku:text,name_ar:text,name_en:z.string().max(180).default(''),category_id:uuid,base_unit:z.enum(units),precision:z.number().int().min(0).max(6),brand:z.string().max(180).default(''),specification:z.string().max(2000).default('')}).strict()).min(1).max(1000)}).strict().parse(body);
   const seen=new Set<string>();const rows=[];for(const r of b.rows){const issues:string[]=[];if(seen.has(r.sku)||await one(tx,'SELECT 1 FROM items WHERE sku=$1',[r.sku]))issues.push('SKU مكرر؛ يحتاج مراجعة ولا يُضاف تلقائيًا');seen.add(r.sku);if(!await one(tx,'SELECT 1 FROM categories WHERE id=$1 AND parent_id IS NOT NULL AND active',[r.category_id]))issues.push('التصنيف الفرعي غير صالح');rows.push({...r,issues});}
   id=(await tx.query('INSERT INTO imports(created_by,source,rows) VALUES($1,$2,$3) RETURNING id',[a.id,b.source,json(rows)])).rows[0].id;
  }else if(action==='approve'){
   permit(a,'approve');permit(a,'catalog.write');const b=z.object({selected_rows:z.array(z.number().int().positive()).min(1).max(1000)}).strict().parse(body);
   const batch=await one(tx,'SELECT * FROM imports WHERE id=$1',[uuid.parse(id)]);if(!batch||batch.status!=='Preview')fail('STATE','دفعة الاستيراد معتمدة أو غير موجودة',409);if(batch.created_by===a.id)fail('SELF_APPROVAL','مستخدم آخر يعتمد الاستيراد',403);
   const selected=batch.rows.filter((r:any)=>b.selected_rows.includes(r.source_row));if(selected.length!==new Set(b.selected_rows).size||selected.some((r:any)=>r.issues.length))fail('IMPORT','راجع التكرارات والحقول قبل الاعتماد');
   for(const r of selected)await this.catalog.save(tx,a,'items',{sku:r.sku,name_ar:r.name_ar,name_en:r.name_en,category_id:r.category_id,base_unit:r.base_unit,precision:r.precision,brand:r.brand,specification:r.specification,tracking:'consumable',data:{import_id:id,source:batch.source,source_row:String(r.source_row),original_text:r.original_text}});
   await tx.query("UPDATE imports SET status='Approved',approved_by=$2 WHERE id=$1",[id,a.id]);
  }else fail('ACTION','إجراء غير معروف');
  return this.read(tx,a,'imports',id);
 }
}
