import { SQL, one } from './db';
import { Actor, permit, warehouse, department, fail, z, uuid, nullableId, text, date, qty, decimal, Decimal, json, visible, hash } from './common';
const TYPES=['opening','receipt','production_receipt','issue','transfer','shipment','transfer_receipt','reserve','release','return','supplier_return','custody','custody_return','quality','scrap','adjustment_in','adjustment_out','reversal'] as const;
const quality=z.enum(['Accepted','Under Inspection','Rejected','Blocked']);
const condition=z.enum(['New','Used','Repair','Damaged']);
const lineSchema=z.object({item_id:uuid,quantity:qty,unit:text,location_id:nullableId,destination_location_id:nullableId,lot_id:nullableId,serial_id:nullableId,quality:quality.default('Accepted'),condition:condition.default('New'),destination_quality:quality.optional(),unit_cost:decimal.nullable().optional(),reference_line_id:nullableId,purchase_line_id:nullableId,notes:z.string().max(1000).default('')}).strict();
const docSchema=z.object({type:z.enum(TYPES),document_date:date,warehouse_id:uuid,destination_warehouse_id:nullableId,department_id:nullableId,recipient_id:nullableId,machine_id:nullableId,supplier_id:nullableId,reference_id:nullableId,reason:z.string().trim().max(1000).default(''),notes:z.string().max(4000).default(''),currency:z.enum(['EGP','USD','EUR']).default('EGP'),exchange_rate:qty.default('1'),version:z.number().int().positive().optional(),metadata:z.object({due_on:date.optional(),invoice:z.string().max(100).optional(),production_order:z.string().max(100).optional()}).strict().default({}),lines:z.array(lineSchema).min(1).max(100)}).strict();
const permission:Record<string,string>={opening:'receipt',receipt:'receipt',production_receipt:'receipt',issue:'issue',transfer:'transfer',shipment:'transfer',transfer_receipt:'transfer',reserve:'reserve',release:'reserve',return:'issue',supplier_return:'receipt',custody:'custody',custody_return:'custody',quality:'quality',scrap:'count',adjustment_in:'count',adjustment_out:'count',reversal:'reverse'};
const sensitive=new Set(['opening','scrap','adjustment_in','adjustment_out','reversal']);
const inbound=new Set(['opening','receipt','production_receipt','adjustment_in']);
type Position={item_id:string,warehouse_id:string,location_id:string|null,lot_id:string|null,serial_id:string|null,quality:string,condition:string,holder_id:string|null,transit_id:string|null};
function position(doc:any,line:any,overrides:Partial<Position>={}):Position{return{item_id:line.item_id,warehouse_id:doc.warehouse_id,location_id:line.location_id||null,lot_id:line.lot_id||null,serial_id:line.serial_id||null,quality:line.quality,condition:line.condition,holder_id:null,transit_id:null,...overrides};}
function positionKey(p:Position){return hash([p.item_id,p.warehouse_id,p.location_id,p.lot_id,p.serial_id,p.quality,p.condition,p.holder_id,p.transit_id].join('|'));}
function decimalString(value:Decimal){return value.toFixed(6);}
export class Stock {
 async get(tx:SQL,a:Actor,id:string){
  permit(a,'stock.read');const d=await one(tx,`SELECT d.*,u.display_name creator_name,m.name recipient_name,m.data->>'badge' recipient_badge,m.data->>'job_title' recipient_job,dep.name department_name FROM documents d JOIN users u ON u.id=d.created_by LEFT JOIN masters m ON m.id=d.recipient_id LEFT JOIN masters dep ON dep.id=d.department_id WHERE d.id=$1`,[uuid.parse(id)]);if(!d)fail('NOT_FOUND','المستند غير موجود',404);warehouse(a,d.warehouse_id);department(a,d.department_id);if(d.destination_warehouse_id)warehouse(a,d.destination_warehouse_id);
  d.lines=(await tx.query('SELECT l.*,i.sku,i.name_ar,i.base_unit FROM document_lines l JOIN items i ON i.id=l.item_id WHERE document_id=$1 ORDER BY l.id',[id])).rows;return visible(d,a);
 }
 async list(tx:SQL,a:Actor,q:Record<string,string>={}){
  permit(a,'stock.read');if(q.warehouse_id)warehouse(a,uuid.parse(q.warehouse_id));const warehouses=a.all_warehouses?null:a.warehouse_ids;
  const deptId=q.department_id?uuid.parse(q.department_id):null;
  const recId=q.recipient_id?uuid.parse(q.recipient_id):null;
  const docType=q.type||'';
  return visible((await tx.query(`SELECT d.*,u.display_name creator_name,m.name recipient_name,m.data->>'badge' recipient_badge,m.data->>'job_title' recipient_job,dep.name department_name, (SELECT count(*)::int FROM document_lines l WHERE l.document_id=d.id) lines_count FROM documents d JOIN users u ON u.id=d.created_by
   LEFT JOIN masters m ON m.id=d.recipient_id LEFT JOIN masters dep ON dep.id=d.department_id
   WHERE ($1::uuid[] IS NULL OR (d.warehouse_id=ANY($1) AND (d.destination_warehouse_id IS NULL OR d.destination_warehouse_id=ANY($1))))
   AND ($2::uuid[] IS NULL OR d.department_id IS NULL OR d.department_id=ANY($2))
   AND ($3='' OR d.status=$3)
   AND ($4::uuid IS NULL OR d.warehouse_id=$4 OR d.destination_warehouse_id=$4)
   AND ($5::uuid IS NULL OR d.department_id=$5)
   AND ($6::uuid IS NULL OR d.recipient_id=$6)
   AND ($7='' OR d.type=$7)
   ORDER BY d.created_at DESC LIMIT 500`,[warehouses,a.all_departments?null:a.department_ids,q.status||'',q.warehouse_id?uuid.parse(q.warehouse_id):null,deptId,recId,docType])).rows,a);
 }
 async save(tx:SQL,a:Actor,body:unknown,id?:string){
  const b=docSchema.parse(body);permit(a,permission[b.type]!);warehouse(a,b.warehouse_id);department(a,b.department_id);
  if(!await one(tx,'SELECT 1 FROM warehouses WHERE id=$1 AND active',[b.warehouse_id]))fail('WAREHOUSE','المخزن غير فعال');
  if(b.destination_warehouse_id){warehouse(a,b.destination_warehouse_id);if(!await one(tx,'SELECT 1 FROM warehouses WHERE id=$1 AND active',[b.destination_warehouse_id]))fail('WAREHOUSE','المخزن الهدف غير فعال');}
  if(['issue','custody','scrap','adjustment_in','adjustment_out','reversal'].includes(b.type)&&!b.reason)fail('REASON','السبب مطلوب');
  if(b.type==='issue'&&!b.department_id&&!b.machine_id)fail('BENEFICIARY','القسم أو الماكينة المستفيدة مطلوب');
  if(b.type==='custody'&&(!b.recipient_id&&!b.machine_id||!b.metadata.due_on))fail('CUSTODY','المستلم أو الماكينة وتاريخ الإرجاع مطلوبان');
  if(['transfer','shipment'].includes(b.type)&&!b.destination_warehouse_id)fail('DESTINATION','حدد مخزن الاستلام');
  if(['return','supplier_return','custody_return','transfer_receipt','release','reversal'].includes(b.type)&&!b.reference_id)fail('REFERENCE','المستند الأصلي مطلوب');
  if(b.type==='reversal')fail('REVERSAL','أنشئ العكس من المستند الأصلي');
  if(b.currency==='EGP'&&!new Decimal(b.exchange_rate).eq(1))fail('CURRENCY','معامل EGP يجب أن يكون 1');
  if(b.type==='production_receipt'&&!b.metadata.production_order)fail('PRODUCTION','مرجع أمر الإنتاج مطلوب');
  for(const [field,kind]of [['department_id','department'],['recipient_id','employee'],['machine_id','machine'],['supplier_id','supplier']] as const){const v=b[field];if(v&&!await one(tx,'SELECT 1 FROM masters WHERE id=$1 AND kind=$2 AND active',[v,kind]))fail('REFERENCE','المرجع غير فعال: '+field);}
  if(b.reference_id){const source=await one(tx,'SELECT * FROM documents WHERE id=$1',[b.reference_id]);if(!source||source.status!=='Posted')fail('REFERENCE','المستند الأصلي غير مُرحل');warehouse(a,source.warehouse_id);if(source.destination_warehouse_id)warehouse(a,source.destination_warehouse_id);department(a,source.department_id);}
  const parsed=[];
  for(const l of b.lines){
   const item=await one(tx,'SELECT * FROM items WHERE id=$1 AND active',[l.item_id]);if(!item)fail('ITEM','الصنف غير فعال');
   let factor='1';if(l.unit!==item.base_unit){const conversion=await one(tx,'SELECT factor FROM conversions WHERE item_id=$1 AND unit=$2',[l.item_id,l.unit]);if(!conversion)fail('CONVERSION','تحويل الوحدة غير معتمد لهذا الصنف');factor=conversion.factor;}
   const base=new Decimal(l.quantity).mul(factor);if(base.decimalPlaces()>item.precision||base.gt('999999999999999'))fail('PRECISION','الكمية لا تناسب دقة وحدة الصنف');
   if(item.track_lot&&!l.lot_id)fail('LOT','اللوت مطلوب');if(item.track_serial&&(!l.serial_id||!base.eq(1)))fail('SERIAL','السيريال والكمية الصحيحة 1 مطلوبان');
   if(l.lot_id&&!await one(tx,'SELECT 1 FROM lots WHERE id=$1 AND item_id=$2',[l.lot_id,l.item_id]))fail('LOT','اللوت لا يخص الصنف');
   if(l.serial_id&&!await one(tx,'SELECT 1 FROM serials WHERE id=$1 AND item_id=$2',[l.serial_id,l.item_id]))fail('SERIAL','السيريال لا يخص الصنف');
   if(l.location_id&&!await one(tx,'SELECT 1 FROM locations WHERE id=$1 AND warehouse_id=$2 AND active',[l.location_id,b.warehouse_id]))fail('LOCATION','الموضع لا يخص المخزن');
   if(l.destination_location_id&&!await one(tx,'SELECT 1 FROM locations WHERE id=$1 AND warehouse_id=$2 AND active',[l.destination_location_id,b.destination_warehouse_id||b.warehouse_id]))fail('LOCATION','الموضع الهدف لا يخص المخزن');
   if(l.unit_cost!=null)permit(a,'cost.read');
   if(b.type==='quality'&&(!l.destination_quality||l.destination_quality===l.quality))fail('QUALITY','حدد حالة الجودة الجديدة');
   if(['return','supplier_return','custody_return','transfer_receipt','release'].includes(b.type)&&!l.reference_line_id)fail('REFERENCE','حدد بند المستند الأصلي');
   parsed.push({...l,factor,base_quantity:decimalString(base)});
  }
  if(id){const old=await one(tx,'SELECT * FROM documents WHERE id=$1',[uuid.parse(id)]);if(!old)fail('NOT_FOUND','المستند غير موجود',404);warehouse(a,old.warehouse_id);department(a,old.department_id);if(old.destination_warehouse_id)warehouse(a,old.destination_warehouse_id);if(old.status!=='Draft'||old.version!==b.version)fail('CONFLICT','المستند تغير أو لم يعد مسودة',409);if(old.created_by!==a.id&&!a.permissions.includes('approve'))fail('OWNER','لا يمكنك تعديل مسودة مستخدم آخر',403);if(!a.permissions.includes('cost.read')&&await one(tx,'SELECT 1 FROM document_lines WHERE document_id=$1 AND unit_cost IS NOT NULL',[id]))fail('COST_EDIT','المسودة تتضمن تكلفة؛ يلزم مستخدم مخول بالتكلفة لتعديلها',403);await tx.query('DELETE FROM document_lines WHERE document_id=$1',[id]);}
  const values=[b.type,b.document_date,b.warehouse_id,b.destination_warehouse_id||null,b.department_id||null,b.recipient_id||null,b.machine_id||null,b.supplier_id||null,b.reference_id||null,b.reason,b.notes,b.currency,b.exchange_rate,json(b.metadata)];
  if(id)await tx.query('UPDATE documents SET type=$1,document_date=$2,warehouse_id=$3,destination_warehouse_id=$4,department_id=$5,recipient_id=$6,machine_id=$7,supplier_id=$8,reference_id=$9,reason=$10,notes=$11,currency=$12,exchange_rate=$13,metadata=$14,version=version+1 WHERE id=$15',[...values,id]);
  else id=(await tx.query('INSERT INTO documents(type,document_date,warehouse_id,destination_warehouse_id,department_id,recipient_id,machine_id,supplier_id,reference_id,reason,notes,currency,exchange_rate,metadata,created_by) VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+',$15) RETURNING id',[...values,a.id])).rows[0].id;
  for(const l of parsed)await tx.query('INSERT INTO document_lines(document_id,item_id,quantity,unit,factor,base_quantity,location_id,destination_location_id,lot_id,serial_id,quality,condition,destination_quality,unit_cost,reference_line_id,notes,purchase_line_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',[id,l.item_id,l.quantity,l.unit,l.factor,l.base_quantity,l.location_id||null,l.destination_location_id||null,l.lot_id||null,l.serial_id||null,l.quality,l.condition,l.destination_quality||null,l.unit_cost??null,l.reference_line_id||null,l.notes,l.purchase_line_id||null]);
  await this.audit(tx,a,'document.save',id!);return this.get(tx,a,id!);
 }
 async action(tx:SQL,a:Actor,id:string,action:string,version:number){
  const d=await one(tx,'SELECT * FROM documents WHERE id=$1',[uuid.parse(id)]);if(!d)fail('NOT_FOUND','المستند غير موجود',404);warehouse(a,d.warehouse_id);department(a,d.department_id);if(d.destination_warehouse_id)warehouse(a,d.destination_warehouse_id);
  if(d.version!==version)fail('CONFLICT','المستند تغير؛ حدّثه قبل المتابعة',409);
  if(action==='submit'){
   permit(a,permission[d.type]!);if(d.status!=='Draft')fail('STATE','المستند ليس مسودة',409);if(d.created_by!==a.id&&!a.permissions.includes('approve'))fail('OWNER','لا يمكنك تقديم مسودة مستخدم آخر',403);
   await tx.query("UPDATE documents SET status=$2,version=version+1 WHERE id=$1",[id,sensitive.has(d.type)?'Pending Approval':'Submitted']);
  }else if(action==='approve'){
   permit(a,'approve');if(d.status!=='Pending Approval')fail('STATE','المستند لا ينتظر اعتمادًا',409);if(d.created_by===a.id)fail('SELF_APPROVAL','هذه الحركة تحتاج اعتماد مستخدم آخر',403);
   await tx.query("UPDATE documents SET status='Submitted',approved_by=$2,version=version+1 WHERE id=$1",[id,a.id]);
  }else if(action==='reject'||action==='cancel'){
   if(action==='reject')permit(a,'approve');else if(d.created_by!==a.id)permit(a,'approve');
   if(['Posted','Reversed','Cancelled'].includes(d.status))fail('STATE','لا يمكن إلغاء أو تعديل حركة مُرحلة',409);
   await tx.query('UPDATE documents SET status=$2,version=version+1 WHERE id=$1',[id,action==='reject'?'Rejected':'Cancelled']);
  }else if(action==='post'){
   permit(a,permission[d.type]!);if(d.status!=='Submitted')fail('STATE','قدم المستند واعتمده أولًا',409);if(sensitive.has(d.type)&&(!d.approved_by||d.approved_by===d.created_by))fail('APPROVAL','اعتماد مستقل مطلوب',403);
   if(await one(tx,"SELECT 1 FROM inventory_counts WHERE warehouse_id=ANY($1::uuid[]) AND status IN ('Open','Pending Approval')",[[d.warehouse_id,d.destination_warehouse_id].filter(Boolean)]))fail('COUNT_LOCK','جرد مفتوح؛ أكمل اعتماده قبل حركة المخزن',409);
   const closed=await one(tx,"SELECT value FROM settings WHERE key='closed_period'");if(closed?.value?.through&&String(d.document_date).slice(0,10)<=closed.value.through)fail('CLOSED','الفترة مقفلة');
   for(const wid of [d.warehouse_id,d.destination_warehouse_id].filter(Boolean))if(!await one(tx,'SELECT 1 FROM warehouses WHERE id=$1 AND active',[wid]))fail('WAREHOUSE','المخزن غير فعال');
   const lines=(await tx.query('SELECT l.*,i.precision,i.base_unit,i.tracking FROM document_lines l JOIN items i ON i.id=l.item_id WHERE document_id=$1 ORDER BY l.item_id,l.id',[id])).rows;
   for(const line of lines)await this.postLine(tx,a,d,line);
   await tx.query("UPDATE documents SET status='Posted',posted_at=now(),version=version+1 WHERE id=$1",[id]);
   if(d.type==='reversal')await tx.query("UPDATE documents SET status='Reversed',version=version+1 WHERE id=$1",[d.reference_id]);
  }else fail('ACTION','إجراء غير معروف',404);
  await this.audit(tx,a,'document.'+action,id);return this.get(tx,a,id);
 }
 private async balance(tx:SQL,p:Position){
  const key=positionKey(p);await tx.query('INSERT INTO balances(position_key,item_id,warehouse_id,location_id,lot_id,serial_id,quality,condition,holder_id,transit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',[key,p.item_id,p.warehouse_id,p.location_id,p.lot_id,p.serial_id,p.quality,p.condition,p.holder_id,p.transit_id]);
  return(await one(tx,'SELECT * FROM balances WHERE position_key=$1 FOR UPDATE',[key]))!;
 }
 private async available(tx:SQL,p:Position){
  if(p.quality!=='Accepted'||['Repair','Damaged'].includes(p.condition))fail('QUALITY','لا يُصرف مخزون غير مقبول أو غير صالح');
  if(p.lot_id&&await one(tx,'SELECT 1 FROM lots WHERE id=$1 AND expires_on<CURRENT_DATE',[p.lot_id]))fail('EXPIRED','اللوت منتهي الصلاحية');
 }
 private async move(tx:SQL,d:any,l:any,p:Position,delta:Decimal,cost:string|null){
  const b=await this.balance(tx,p),remaining=new Decimal(b.quantity).add(delta);
  if(remaining.lt(b.reserved)||remaining.lt(0))fail('STOCK','الكمية المتاحة غير كافية؛ لا يسمح برصيد سالب',409);
  if(p.serial_id&&delta.gt(0)&&await one(tx,'SELECT 1 FROM balances WHERE serial_id=$1 AND quantity>0 AND position_key<>$2',[p.serial_id,b.position_key]))fail('SERIAL','السيريال موجود في موضع آخر',409);
  if(p.serial_id&&remaining.gt(1))fail('SERIAL','لا يمكن تكرار السيريال',409);
  await tx.query('UPDATE balances SET quantity=$2 WHERE position_key=$1',[b.position_key,decimalString(remaining)]);
  await tx.query('INSERT INTO ledger(document_id,line_id,position_key,quantity,unit_cost) VALUES($1,$2,$3,$4,$5)',[d.id,l.id,b.position_key,decimalString(delta),cost]);
 }
 private async currentCost(tx:SQL,itemId:string){await tx.query('INSERT INTO costs(item_id) VALUES($1) ON CONFLICT DO NOTHING',[itemId]);return(await one(tx,'SELECT * FROM costs WHERE item_id=$1 FOR UPDATE',[itemId]))!;}
 private async adjustCost(tx:SQL,itemId:string,quantity:Decimal,unit:string|null,exact?:{value:Decimal,unpriced:Decimal}){
  const c=await this.currentCost(tx,itemId),total=new Decimal(c.quantity).add(quantity);let unknown=new Decimal(c.unpriced_quantity),value=new Decimal(c.value);
  if(exact){unknown=unknown.add(exact.unpriced);value=value.add(exact.value);}
  else if(quantity.isPositive()){if(unit==null)unknown=unknown.add(quantity);else value=value.add(quantity.mul(unit));}
  else if(unit==null){
   // An issue from mixed priced/unpriced stock consumes both portions proportionally.
   const ratio=new Decimal(c.quantity).isZero()?new Decimal(0):quantity.neg().div(c.quantity);
   unknown=unknown.mul(new Decimal(1).sub(ratio));value=value.mul(new Decimal(1).sub(ratio));
  }else value=value.add(quantity.mul(unit));
  if(total.lt(0)||value.lt('-0.000000001')||unknown.lt('-0.000001')||unknown.gt(total.add('0.000001')))fail('COST','تعارض في تقييم المخزون',409);
  if(total.isZero()){unknown=new Decimal(0);value=new Decimal(0);}
  value=Decimal.max(value,0).toDecimalPlaces(9);unknown=Decimal.max(0,Decimal.min(unknown,total)).toDecimalPlaces(6);
  await tx.query('UPDATE costs SET quantity=$2,value=$3,unpriced_quantity=$4,last_price=COALESCE($5,last_price) WHERE item_id=$1',[itemId,decimalString(total),value.toFixed(9),unknown.toFixed(6),quantity.gt(0)?unit:null]);
  return{value:value.sub(c.value),unpriced:unknown.sub(c.unpriced_quantity)};
 }
 private async reference(tx:SQL,a:Actor,d:any,l:any,types:string[]){
  const r=await one(tx,'SELECT l.*,d.type original_type,d.status original_status,d.warehouse_id original_warehouse,d.destination_warehouse_id original_destination,d.recipient_id original_recipient,d.machine_id original_machine,d.department_id original_department FROM document_lines l JOIN documents d ON d.id=l.document_id WHERE l.id=$1 AND l.document_id=$2',[l.reference_line_id,d.reference_id]);
  if(!r||r.original_status!=='Posted'||!types.includes(r.original_type)||r.item_id!==l.item_id||r.lot_id!==l.lot_id||r.serial_id!==l.serial_id)fail('REFERENCE','البند لا يطابق الحركة الأصلية');
  warehouse(a,r.original_warehouse);if(r.original_destination)warehouse(a,r.original_destination);department(a,r.original_department);
  const consumed=await one(tx,`SELECT COALESCE(sum(l.base_quantity),0) quantity FROM document_lines l JOIN documents d ON d.id=l.document_id WHERE l.reference_line_id=$1 AND (d.status='Posted' OR d.id=$3) AND d.type=$2`,[r.id,d.type,d.id]);
  if(new Decimal(consumed!.quantity).gt(r.base_quantity))fail('REFERENCE_LIMIT','الكمية تتجاوز المتبقي في المستند الأصلي',409);return r;
 }
 private async postLine(tx:SQL,a:Actor,d:any,l:any){
  const q=new Decimal(l.base_quantity),p=position(d,l),c=await this.currentCost(tx,l.item_id);
  if(!await one(tx,'SELECT 1 FROM items WHERE id=$1 AND active',[l.item_id]))fail('ITEM','الصنف غير فعال');
  for(const [lid,wid]of [[l.location_id,d.warehouse_id],[l.destination_location_id,d.destination_warehouse_id||d.warehouse_id]])if(lid&&!await one(tx,'SELECT 1 FROM locations WHERE id=$1 AND warehouse_id=$2 AND active',[lid,wid]))fail('LOCATION','موضع المخزن غير فعال');
  let cost:string|null=new Decimal(c.quantity).gt(0)&&new Decimal(c.unpriced_quantity).isZero()?new Decimal(c.value).div(c.quantity).toFixed(9):null;
  let valuation={value:new Decimal(0),unpriced:new Decimal(0)};
  if(inbound.has(d.type)){
   if(l.purchase_line_id){
    if(d.type!=='receipt')fail('PURCHASE','أمر الشراء يرتبط باستلام مشتريات فقط');
    const po=await one(tx,'SELECT l.*,p.status,p.warehouse_id,p.supplier_id,p.currency FROM purchase_lines l JOIN purchase_orders p ON p.id=l.order_id WHERE l.id=$1',[l.purchase_line_id]);
    if(!po||!['Approved','Partial'].includes(po.status)||po.warehouse_id!==d.warehouse_id||po.supplier_id!==d.supplier_id||po.currency!==d.currency||po.item_id!==l.item_id||po.unit!==l.unit)fail('PURCHASE','بند أمر الشراء غير مطابق أو غير معتمد');
    if(new Decimal(po.received).add(l.quantity).gt(po.quantity))fail('PURCHASE_LIMIT','الاستلام يتجاوز المتبقي في أمر الشراء',409);
    await tx.query('UPDATE purchase_lines SET received=received+$2 WHERE id=$1',[po.id,l.quantity]);
    await tx.query("UPDATE purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM purchase_lines WHERE order_id=$1 AND received<quantity) THEN 'Partial' ELSE 'Received' END,version=version+1 WHERE id=$1",[po.order_id]);
   }
   cost=l.unit_cost==null?null:new Decimal(l.unit_cost).mul(d.exchange_rate).div(l.factor).toFixed(9);
   if(cost!=null)permit(a,'cost.read');await this.move(tx,d,l,p,q,cost);valuation=await this.adjustCost(tx,l.item_id,q,cost);
  }else if(['issue','scrap','adjustment_out','supplier_return'].includes(d.type)){
   if(d.type!=='scrap')await this.available(tx,p);
   if(d.type==='supplier_return'){const r=await this.reference(tx,a,d,l,['receipt']);if(r.original_warehouse!==d.warehouse_id)fail('REFERENCE','مخزن المرتجع لا يطابق الاستلام');}
   await this.move(tx,d,l,p,q.neg(),cost);valuation=await this.adjustCost(tx,l.item_id,q.neg(),cost);
  }else if(['transfer','shipment','quality','custody'].includes(d.type)){
   if(d.type!=='quality')await this.available(tx,p);
   if(d.type==='custody'&&l.tracking==='consumable')fail('CUSTODY','الصنف مستهلك؛ غيّر نوع التتبع قبل بدء الحركات');
   const target=position(d,l,d.type==='quality'?{quality:l.destination_quality}:d.type==='custody'?{holder_id:d.recipient_id||d.machine_id}:d.type==='shipment'?{location_id:null,transit_id:d.id}:{warehouse_id:d.destination_warehouse_id,location_id:l.destination_location_id});
   if(positionKey(p)===positionKey(target))fail('POSITION','المصدر والوجهة متطابقان');
   await this.move(tx,d,l,p,q.neg(),cost);await this.move(tx,d,l,target,q,cost);
   if(d.type==='custody')await tx.query('INSERT INTO custody(document_id,line_id,holder_id,quantity,due_on) VALUES($1,$2,$3,$4,$5)',[d.id,l.id,target.holder_id,l.base_quantity,d.metadata.due_on]);
  }else if(d.type==='return'){
   const r=await this.reference(tx,a,d,l,['issue']);cost=r.posted_unit_cost;
   const totals=await one(tx,`SELECT COALESCE(sum(l.base_quantity),0) quantity,COALESCE(sum(l.posted_value),0) value,COALESCE(sum(l.posted_unpriced_quantity),0) unpriced FROM document_lines l JOIN documents d ON d.id=l.document_id WHERE l.reference_line_id=$1 AND d.type='return' AND (d.status='Posted' OR d.id=$2) AND l.posted_value IS NOT NULL`,[r.id,d.id]);
   const last=q.add(totals!.quantity).eq(r.base_quantity),fraction=q.div(r.base_quantity);
   const exact={value:last?new Decimal(r.posted_value).neg().sub(totals!.value):new Decimal(r.posted_value).neg().mul(fraction),unpriced:last?new Decimal(r.posted_unpriced_quantity).neg().sub(totals!.unpriced):new Decimal(r.posted_unpriced_quantity).neg().mul(fraction)};
   await this.move(tx,d,l,p,q,cost);valuation=await this.adjustCost(tx,l.item_id,q,cost,exact);
  }else if(d.type==='custody_return'){
   const r=await this.reference(tx,a,d,l,['custody']);cost=r.posted_unit_cost;
   const source=position({warehouse_id:r.original_warehouse},r,{holder_id:r.original_recipient||r.original_machine});
   await this.move(tx,d,l,source,q.neg(),cost);await this.move(tx,d,l,p,q,cost);
   await tx.query("UPDATE custody SET returned=returned+$2,state=CASE WHEN returned+$2=quantity THEN 'Returned' ELSE state END WHERE line_id=$1",[r.id,l.base_quantity]);
  }else if(d.type==='transfer_receipt'){
   const r=await this.reference(tx,a,d,l,['shipment']);if(d.warehouse_id!==r.original_destination)fail('DESTINATION','مخزن الاستلام لا يطابق التحويل');
   const source=position({warehouse_id:r.original_warehouse},r,{location_id:null,transit_id:d.reference_id});cost=r.posted_unit_cost;
   await this.move(tx,d,l,source,q.neg(),cost);await this.move(tx,d,l,p,q,cost);
  }else if(d.type==='reserve'){
   await this.available(tx,p);const b=await this.balance(tx,p);if(new Decimal(b.quantity).sub(b.reserved).lt(q))fail('STOCK','المتاح للحجز غير كاف',409);
   await tx.query('UPDATE balances SET reserved=reserved+$2 WHERE position_key=$1',[b.position_key,l.base_quantity]);
   await tx.query('INSERT INTO reservations(document_id,line_id,position_key,quantity,remaining) VALUES($1,$2,$3,$4,$4)',[d.id,l.id,b.position_key,l.base_quantity]);cost=null;
  }else if(d.type==='release'){
   const r=await this.reference(tx,a,d,l,['reserve']);const res=await one(tx,'SELECT * FROM reservations WHERE line_id=$1',[r.id]);if(!res||new Decimal(res.remaining).lt(q))fail('RESERVATION','الحجز غير كاف',409);
   if(positionKey(p)!==res.position_key)fail('RESERVATION','موضع الحجز لا يطابق');
   await tx.query('UPDATE reservations SET remaining=remaining-$2 WHERE id=$1',[res.id,l.base_quantity]);await tx.query('UPDATE balances SET reserved=reserved-$2 WHERE position_key=$1',[res.position_key,l.base_quantity]);cost=null;
  }else if(d.type==='reversal'){
   const r=await one(tx,'SELECT * FROM document_lines WHERE id=$1 AND document_id=$2',[l.reference_line_id,d.reference_id]);if(!r)fail('REVERSAL','البند الأصلي غير موجود');
   const original=await one(tx,'SELECT * FROM documents WHERE id=$1',[d.reference_id]);if(!original||original.status!=='Posted')fail('REVERSAL','الحركة الأصلية لم تعد مُرحلة',409);
   if(await one(tx,"SELECT 1 FROM documents WHERE reference_id=$1 AND status='Posted'",[d.reference_id]))fail('REVERSAL','للحركة عمليات لاحقة؛ اعكسها أولًا',409);
   if(['reserve','release','custody','custody_return','shipment','transfer_receipt'].includes(original.type))fail('REVERSAL','استخدم حركة الإرجاع/فك الحجز المرتبطة للحفاظ على المتبقي');
   const entries=(await tx.query('SELECT l.*,b.item_id,b.warehouse_id,b.location_id,b.lot_id,b.serial_id,b.quality,b.condition,b.holder_id,b.transit_id FROM ledger l JOIN balances b ON b.position_key=l.position_key WHERE l.line_id=$1 ORDER BY l.quantity DESC',[r.id])).rows;
   for(const e of entries)await this.move(tx,d,l,e,new Decimal(e.quantity).neg(),e.unit_cost);
   const net=entries.reduce((sum,e)=>sum.add(e.quantity),new Decimal(0));cost=r.posted_unit_cost;if(!net.isZero())valuation=await this.adjustCost(tx,l.item_id,net.neg(),cost,{value:new Decimal(r.posted_value).neg(),unpriced:new Decimal(r.posted_unpriced_quantity).neg()});
  }else fail('TYPE','نوع الحركة غير مدعوم');
  await tx.query('UPDATE document_lines SET posted_unit_cost=$2,posted_value=$3,posted_unpriced_quantity=$4 WHERE id=$1',[l.id,cost,valuation.value.toFixed(9),valuation.unpriced.toFixed(6)]);
 }
 async reverse(tx:SQL,a:Actor,id:string,reason:string,version:number){
  permit(a,'reverse');const original=await this.get(tx,a,id);if(original.status!=='Posted')fail('STATE','الحركة ليست مُرحلة',409);
  if(original.version!==version)fail('CONFLICT','المستند تغير؛ حدّثه قبل إنشاء العكس',409);
  const unsupported=['reserve','release','custody','custody_return','shipment','transfer_receipt','reversal'];if(unsupported.includes(original.type))fail('REVERSAL','استخدم المستند المرتبط المناسب لفك الحجز أو الإرجاع');
  const existing=await one(tx,"SELECT 1 FROM documents WHERE reference_id=$1 AND type='reversal' AND status NOT IN ('Rejected','Cancelled')",[id]);if(existing)fail('REVERSAL','يوجد عكس لهذه الحركة بالفعل',409);
  const result=await one(tx,`INSERT INTO documents(type,document_date,warehouse_id,destination_warehouse_id,department_id,reference_id,reason,created_by) VALUES('reversal',CURRENT_DATE,$1,$2,$3,$4,$5,$6) RETURNING id`,[original.warehouse_id,original.destination_warehouse_id,original.department_id,id,text.parse(reason),a.id]);
  await tx.query(`INSERT INTO document_lines(document_id,item_id,quantity,unit,factor,base_quantity,location_id,destination_location_id,lot_id,serial_id,quality,condition,unit_cost,reference_line_id) SELECT $1,item_id,quantity,unit,factor,base_quantity,location_id,destination_location_id,lot_id,serial_id,quality,condition,posted_unit_cost,id FROM document_lines WHERE document_id=$2`,[result!.id,id]);
  await this.audit(tx,a,'document.reverse-draft',result!.id);return this.get(tx,a,result!.id);
 }
 private async audit(tx:SQL,a:Actor,action:string,id:string){await tx.query('INSERT INTO audit(user_id,action,target) VALUES($1,$2,$3)',[a.id,action,id]);await tx.query("INSERT INTO changes(entity,entity_id,warehouse_id) SELECT 'documents',id::text,warehouse_id FROM documents WHERE id=$1",[id]);}
}
