import { SQL, one } from './db';
import { Actor, permit, warehouse, department, fail, z, text, uuid, nullableId, decimal, qty, Decimal, json, visible, date } from './common';
export const units=['Piece','Kg','Gram','Liter','Meter','Roll','Bag','Bottle','Box','Set','Bar'] as const;
export class Catalog {
 async list(tx:SQL,a:Actor,kind:string,q:Record<string,string>={}){
  permit(a,'catalog.read');
  if(q.warehouse_id)warehouse(a,uuid.parse(q.warehouse_id));
  const scope=q.warehouse_id?[q.warehouse_id]:(a.all_warehouses?null:a.warehouse_ids);
  if(kind==='warehouses')return (await tx.query('SELECT * FROM warehouses WHERE active AND ($1::uuid[] IS NULL OR id=ANY($1)) ORDER BY name',[scope])).rows;
  if(kind==='locations')return (await tx.query('SELECT * FROM locations WHERE active AND ($1::uuid[] IS NULL OR warehouse_id=ANY($1)) ORDER BY name',[scope])).rows;
  if(kind==='categories'){
   const rows=(await tx.query(`SELECT c.*, (SELECT count(*)::int FROM categories sub WHERE sub.parent_id=c.id AND sub.active) subcategory_count,
    (SELECT count(*)::int FROM items i WHERE i.active AND (i.category_id=c.id OR i.category_id IN(SELECT id FROM categories WHERE parent_id=c.id)) AND ($1::uuid[] IS NULL OR EXISTS(SELECT 1 FROM balances b WHERE b.item_id=i.id AND b.warehouse_id=ANY($1)))) item_count
    FROM categories c WHERE c.active ORDER BY c.sort,c.name_en`,[scope])).rows;
   const metrics=(await tx.query(`WITH stock AS (SELECT b.item_id,b.warehouse_id,sum(CASE WHEN b.quality='Accepted' AND b.condition NOT IN('Repair','Damaged') AND b.holder_id IS NULL AND b.transit_id IS NULL AND (lot.expires_on IS NULL OR lot.expires_on>=CURRENT_DATE) THEN b.quantity-b.reserved ELSE 0 END) available FROM balances b LEFT JOIN lots lot ON lot.id=b.lot_id WHERE ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1)) GROUP BY b.item_id,b.warehouse_id)
    SELECT i.category_id,count(DISTINCT i.id)::int low_stock_count FROM item_levels levels JOIN items i ON i.id=levels.item_id LEFT JOIN stock s ON s.item_id=levels.item_id AND s.warehouse_id=levels.warehouse_id WHERE i.active AND ($1::uuid[] IS NULL OR levels.warehouse_id=ANY($1)) AND COALESCE(s.available,0)<levels.minimum GROUP BY i.category_id`,[scope])).rows;
   const values=a.permissions.includes('cost.read')?(await tx.query(`SELECT i.category_id,sum(CASE WHEN c.unpriced_quantity=0 AND c.quantity>0 THEN b.quantity*c.value/c.quantity ELSE 0 END) value,count(DISTINCT CASE WHEN b.quantity>0 AND c.unpriced_quantity>0 THEN i.id END)::int unpriced_items FROM balances b JOIN items i ON i.id=b.item_id LEFT JOIN costs c ON c.item_id=b.item_id WHERE ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1)) GROUP BY i.category_id`,[scope])).rows:[];
   for(const row of rows){const ids=new Set([row.id,...rows.filter(c=>c.parent_id===row.id).map(c=>c.id)]);row.low_stock_count=metrics.filter(m=>ids.has(m.category_id)).reduce((n,m)=>n+m.low_stock_count,0);if(a.permissions.includes('cost.read')){row.value=values.filter(v=>ids.has(v.category_id)).reduce((sum,v)=>sum.add(v.value||0),new Decimal(0)).toFixed(2);row.unpriced_items=values.filter(v=>ids.has(v.category_id)).reduce((n,v)=>n+v.unpriced_items,0);}}
   return rows;
  }
  if(kind==='items'){
   const limit=Math.min(100,Math.max(1,Number(q.limit)||40)),offset=Math.max(0,Math.min(100000,Number(q.offset)||0));
   return visible((await tx.query(`SELECT i.*, c.illustration, costs.last_price,CASE WHEN costs.unpriced_quantity=0 AND costs.quantity>0 THEN costs.value/costs.quantity END average_cost,
    COALESCE((SELECT sum(b.quantity-b.reserved) FROM balances b LEFT JOIN lots l ON l.id=b.lot_id WHERE b.item_id=i.id AND b.quality='Accepted' AND b.condition<>'Repair' AND b.condition<>'Damaged' AND b.holder_id IS NULL AND b.transit_id IS NULL AND (l.expires_on IS NULL OR l.expires_on>=CURRENT_DATE) AND ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1))),0) available,
    COALESCE((SELECT sum(b.reserved) FROM balances b WHERE b.item_id=i.id AND ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1))),0) reserved,
    COALESCE((SELECT max(levels.minimum) FROM item_levels levels WHERE levels.item_id=i.id AND ($1::uuid[] IS NULL OR levels.warehouse_id=ANY($1))),0) minimum,
    (SELECT id FROM attachments at WHERE at.item_id=i.id AND at.primary_image AND at.document_id IS NULL AND at.warehouse_id IS NULL LIMIT 1) image_id
    FROM items i JOIN categories c ON c.id=i.category_id LEFT JOIN costs ON costs.item_id=i.id WHERE i.active AND ($2::uuid IS NULL OR i.category_id=$2 OR c.parent_id=$2)
    AND ($3='' OR concat_ws(' ',i.sku,i.name_ar,i.name_en,i.brand,i.specification) ILIKE '%'||$3||'%' OR EXISTS(SELECT 1 FROM item_codes ic WHERE ic.item_id=i.id AND ic.code ILIKE '%'||$3||'%'))
    ORDER BY i.sku LIMIT $4 OFFSET $5`,[scope,q.category_id?uuid.parse(q.category_id):null,(q.search||'').slice(0,120),limit,offset])).rows,a);
  }
  if(kind==='masters')return(await tx.query('SELECT * FROM masters WHERE active AND ($1=\'\' OR kind=$1) ORDER BY name',[(q.kind||'').slice(0,30)])).rows;
  if(kind==='lots')return(await tx.query('SELECT * FROM lots WHERE item_id=$1 ORDER BY received_on DESC',[uuid.parse(q.item_id)])).rows;
  fail('NOT_FOUND','غير موجود',404);
 }
 async item(tx:SQL,a:Actor,id:string){
  permit(a,'catalog.read');const item=await one(tx,'SELECT i.*,c.name_ar category_name FROM items i JOIN categories c ON c.id=i.category_id WHERE i.id=$1',[uuid.parse(id)]);if(!item)fail('NOT_FOUND','الصنف غير موجود',404);
  const scope=a.all_warehouses?null:a.warehouse_ids;
  const positions=(await tx.query(`SELECT b.*,w.name warehouse_name,l.name location_name,lot.code lot_code,lot.expires_on FROM balances b JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN locations l ON l.id=b.location_id LEFT JOIN lots lot ON lot.id=b.lot_id WHERE b.item_id=$1 AND ($2::uuid[] IS NULL OR b.warehouse_id=ANY($2)) ORDER BY w.name`,[id,scope])).rows;
  const costs=await one(tx,'SELECT quantity,value,unpriced_quantity,last_price,CASE WHEN unpriced_quantity=0 AND quantity>0 THEN value/quantity END average_cost FROM costs WHERE item_id=$1',[id]);
  if(costs&&!a.all_warehouses){
   const allowedQuantity=positions.reduce((sum:any,p:any)=>sum.add(p.quantity),new Decimal(0));
   const fraction=new Decimal(costs.quantity).gt(0)?allowedQuantity.div(costs.quantity):new Decimal(0);
   costs.quantity=allowedQuantity.toFixed(6);costs.value=new Decimal(costs.value).mul(fraction).toFixed(9);costs.unpriced_quantity=new Decimal(costs.unpriced_quantity).mul(fraction).toFixed(6);
  }
  const conversions=(await tx.query('SELECT * FROM conversions WHERE item_id=$1',[id])).rows;
  const codes=(await tx.query('SELECT code,kind,supplier_id FROM item_codes WHERE item_id=$1',[id])).rows;
  return visible({...item,positions,conversions,codes,...(a.permissions.includes('cost.read')?{costs:costs||null}:{})},a);
 }
 async save(tx:SQL,a:Actor,kind:string,body:unknown,id?:string){
  permit(a,kind==='warehouses'||kind==='locations'?'settings':'catalog.write');
  if(id)uuid.parse(id);
  if(kind==='warehouses'){
   const b=z.object({name:text,site_id:nullableId,version:z.number().int().optional(),active:z.boolean().default(true)}).strict().parse(body);
   if(b.site_id&&!await one(tx,"SELECT 1 FROM masters WHERE id=$1 AND kind='site'",[b.site_id]))fail('SITE','الموقع غير موجود');
   if(id){warehouse(a,id);const old=await one(tx,'SELECT * FROM warehouses WHERE id=$1',[id]);if(!old||old.version!==b.version)fail('CONFLICT','المخزن تغير أو غير موجود',409);await tx.query('UPDATE warehouses SET name=$2,site_id=$3,active=$4,version=version+1 WHERE id=$1',[id,b.name,b.site_id||null,b.active]);}
   else{if(!a.all_warehouses)fail('SCOPE','إنشاء مخزن يحتاج مديرًا عامًا',403);id=(await tx.query('INSERT INTO warehouses(name,site_id) VALUES($1,$2) RETURNING id',[b.name,b.site_id||null])).rows[0].id;}
  } else if(kind==='locations'){
   const b=z.object({warehouse_id:uuid,name:text,rack:z.string().max(80).default(''),shelf:z.string().max(80).default(''),bin:z.string().max(80).default('')}).strict().parse(body);warehouse(a,b.warehouse_id);
   if(id)fail('IMMUTABLE','أضف موضعًا جديدًا بدل تغيير مرجع موضع مستخدم');id=(await tx.query('INSERT INTO locations(warehouse_id,name,rack,shelf,bin) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.warehouse_id,b.name,b.rack,b.shelf,b.bin])).rows[0].id;
  } else if(kind==='masters'){
   const b=z.object({kind:z.enum(['site','department','employee','machine','supplier']),name:text,data:z.record(z.string().max(100),z.string().max(4000)).default({}),active:z.boolean().default(true),version:z.number().int().optional()}).strict().parse(body);
   if(id){const old=await one(tx,'SELECT * FROM masters WHERE id=$1',[id]);if(!old||old.version!==b.version||old.kind!==b.kind)fail('CONFLICT','السجل تغير',409);await tx.query('UPDATE masters SET name=$2,data=$3,active=$4,version=version+1 WHERE id=$1',[id,b.name,json(b.data),b.active]);}
   else id=(await tx.query('INSERT INTO masters(kind,name,data) VALUES($1,$2,$3) RETURNING id',[b.kind,b.name,json(b.data)])).rows[0].id;
  } else if(kind==='categories'){
   const b=z.object({name_ar:text,name_en:text,parent_id:nullableId,illustration:z.string().regex(/^[a-z0-9-]{1,60}$/),sort:z.number().int().min(0).max(10000).default(0),version:z.number().int().optional(),active:z.boolean().default(true)}).strict().parse(body);
   if(b.parent_id){const parent=await one(tx,'SELECT * FROM categories WHERE id=$1',[b.parent_id]);if(!parent||parent.parent_id||b.parent_id===id)fail('CATEGORY','مسموح بمستويين فقط');}
   if(id){const old=await one(tx,'SELECT * FROM categories WHERE id=$1',[id]);if(!old||old.version!==b.version)fail('CONFLICT','التصنيف تغير',409);if(old.parent_id!==b.parent_id&&await one(tx,'SELECT 1 FROM categories WHERE parent_id=$1',[id]))fail('CATEGORY','انقل التصنيفات الفرعية أولًا');await tx.query('UPDATE categories SET name_ar=$2,name_en=$3,parent_id=$4,illustration=$5,sort=$6,active=$7,version=version+1 WHERE id=$1',[id,b.name_ar,b.name_en,b.parent_id||null,b.illustration,b.sort,b.active]);}
   else id=(await tx.query('INSERT INTO categories(name_ar,name_en,parent_id,illustration,sort) VALUES($1,$2,$3,$4,$5) RETURNING id',[b.name_ar,b.name_en,b.parent_id||null,b.illustration,b.sort])).rows[0].id;
  } else if(kind==='items'){
   const b=z.object({sku:text,name_ar:text,name_en:z.string().max(180).default(''),category_id:uuid,description:z.string().max(4000).default(''),brand:z.string().max(180).default(''),specification:z.string().max(2000).default(''),base_unit:z.enum(units),precision:z.number().int().min(0).max(6),tracking:z.enum(['consumable','custody','asset']),track_lot:z.boolean().default(false),track_serial:z.boolean().default(false),track_expiry:z.boolean().default(false),data:z.record(z.string().max(100),z.string().max(4000)).default({}),active:z.boolean().default(true),version:z.number().int().optional()}).strict().parse(body);
   if(!await one(tx,'SELECT 1 FROM categories WHERE id=$1 AND active AND parent_id IS NOT NULL',[b.category_id]))fail('CATEGORY','اختر تصنيفًا فرعيًا فعالًا');
   if(b.track_serial&&(b.base_unit!=='Piece'||b.precision!==0))fail('SERIAL','السيريال يتطلب وحدة Piece صحيحة');if(b.track_expiry&&!b.track_lot)fail('LOT','تاريخ الصلاحية يحتاج تتبع اللوت');
   const values=[b.sku,b.name_ar,b.name_en,b.category_id,b.description,b.brand,b.specification,b.base_unit,b.precision,b.tracking,b.track_lot,b.track_serial,b.track_expiry,json(b.data),b.active];
   if(id){const old=await one(tx,'SELECT * FROM items WHERE id=$1',[id]);if(!old||old.version!==b.version)fail('CONFLICT','الصنف تغير؛ راجع النسخة الحالية',409);if((old.base_unit!==b.base_unit||old.precision!==b.precision||old.track_lot!==b.track_lot||old.track_serial!==b.track_serial||old.track_expiry!==b.track_expiry||old.tracking!==b.tracking)&&await one(tx,'SELECT 1 FROM document_lines WHERE item_id=$1',[id]))fail('UNIT_HISTORY','لا يمكن تغيير الوحدة أو التتبع بعد استخدامها');await tx.query('UPDATE items SET sku=$1,name_ar=$2,name_en=$3,category_id=$4,description=$5,brand=$6,specification=$7,base_unit=$8,precision=$9,tracking=$10,track_lot=$11,track_serial=$12,track_expiry=$13,data=$14,active=$15,version=version+1 WHERE id=$16',[...values,id]);}
   else id=(await tx.query(`INSERT INTO items(sku,name_ar,name_en,category_id,description,brand,specification,base_unit,precision,tracking,track_lot,track_serial,track_expiry,data,active) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,values)).rows[0].id;
  } else if(kind==='conversions'){
   const b=z.object({item_id:uuid,unit:text,factor:qty}).strict().parse(body);const item=await one(tx,'SELECT * FROM items WHERE id=$1',[b.item_id]);if(!item||item.base_unit===b.unit)fail('UNIT','لا يمكن تغيير الوحدة الأساسية');
   id=(await tx.query('INSERT INTO conversions(item_id,unit,factor,approved_by) VALUES($1,$2,$3,$4) RETURNING id',[b.item_id,b.unit,b.factor,a.id])).rows[0].id;
  } else if(kind==='lots'){
   const b=z.object({item_id:uuid,code:text,supplier_id:nullableId,manufactured_on:date.nullable().optional(),expires_on:date.nullable().optional(),notes:z.string().max(2000).default('')}).strict().parse(body);
   const item=await one(tx,'SELECT * FROM items WHERE id=$1 AND active',[b.item_id]);if(!item||!item.track_lot)fail('LOT','الصنف لا يتتبع لوت');if(item.track_expiry&&!b.expires_on)fail('EXPIRY','الصلاحية مطلوبة');if(b.expires_on&&b.manufactured_on&&b.expires_on<b.manufactured_on)fail('EXPIRY','الصلاحية قبل التصنيع');
   id=(await tx.query('INSERT INTO lots(item_id,code,supplier_id,manufactured_on,expires_on,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[b.item_id,b.code,b.supplier_id||null,b.manufactured_on||null,b.expires_on||null,b.notes])).rows[0].id;
  } else fail('NOT_FOUND','غير موجود',404);
  await tx.query('INSERT INTO changes(entity,entity_id) VALUES($1,$2)',[kind,id]);await tx.query('INSERT INTO audit(user_id,action,target) VALUES($1,$2,$3)',[a.id,kind+'.save',id]);return{id};
 }
}
