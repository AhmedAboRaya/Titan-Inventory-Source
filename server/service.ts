import { Database, SQL, one } from './db';
import { Auth } from './auth';
import { Catalog } from './catalog';
import { Stock } from './stock';
import { Workflows } from './workflows';
import { Attachments } from './attachments';
import { exportReport } from './exports';
import { Actor, fail, hash, json, permit, uuid, warehouse, department, visible, z, text, PERMISSIONS, resolveItemId } from './common';
export class Inventory {
 readonly auth:Auth; readonly catalog=new Catalog();readonly stock=new Stock();readonly workflows=new Workflows(this.stock,this.catalog);
 readonly attachments:Attachments;
 constructor(readonly db:Database,attachmentRoot=process.env.ATTACHMENT_ROOT||'.local/attachments'){this.auth=new Auth(db);this.attachments=new Attachments(attachmentRoot);}
 async write(a:Actor,key:string,path:string,body:any,work:(tx:SQL,actor:Actor)=>Promise<any>,sessionHash?:string){
  uuid.parse(key);const fingerprint=hash(json({path,body}));
  return this.db.transaction(async tx=>{
   // Revocation/role changes win over a queued request; never trust an old client Actor.
   const current=await this.auth.actor(tx,a.id);
   if(sessionHash&&!await one(tx,'SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND NOT revoked AND expires_at>now()',[sessionHash,a.id]))fail('SESSION','انتهت صلاحية الجلسة؛ لم يتم إرسال الحركة',401);
   const authorizationHash=hash(json({version:current.version,permissions:[...current.permissions].sort(),warehouses:current.all_warehouses?'all':[...current.warehouse_ids].sort(),departments:current.all_departments?'all':[...current.department_ids].sort()}));
   const old=await one(tx,'SELECT * FROM idempotency WHERE user_id=$1 AND key=$2',[a.id,key]);
   if(old){if(old.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT','هذا الطلب مسجل بمحتوى مختلف',409);if(old.authorization_hash!==authorizationHash)fail('AUTHORIZATION_CHANGED','تغيرت صلاحياتك؛ الطلب السابق مسجل ولن يعاد تنفيذه. راجع نتيجته بحساب مصرح.',403);return visible(old.response,current);}
   const response=visible(await work(tx,current),current);
   await tx.query('INSERT INTO idempotency(user_id,key,fingerprint,authorization_hash,response) VALUES($1,$2,$3,$4,$5)',[a.id,key,fingerprint,authorizationHash,json(response)]);return response;
  });
 }
 async read(a:Actor,path:string,q:Record<string,string>){
  const parts=path.split('/').filter(Boolean),kind=parts[0],id=parts[1];
  if(kind==='bootstrap')return{actor:a,instance:(await one(this.db,"SELECT value FROM settings WHERE key='instance'"))!.value,warehouses:await this.catalog.list(this.db,a,'warehouses'),categories:await this.catalog.list(this.db,a,'categories'),permissions:PERMISSIONS};
  if(['warehouses','locations','categories','items','masters','lots'].includes(kind!))return id&&kind==='items'?this.catalog.item(this.db,a,id):this.catalog.list(this.db,a,kind!,q);
  if(kind==='balances')return this.report(this.db,a,'balances',q);
  if(kind==='documents')return id?this.stock.get(this.db,a,id):this.stock.list(this.db,a,q);
  if(kind==='attachments')return this.attachments.read(this.db,a,id,q);
  if(kind==='exports')return exportReport(this,a,id||'balances',q);
  if(['purchase-orders','counts','imports'].includes(kind!))return this.workflows.read(this.db,a,kind!,id,q);
  if(kind==='serials'){permit(a,'catalog.read');const itemId=await resolveItemId(this.db,q.item_id);return(await this.db.query('SELECT * FROM serials WHERE item_id=$1',[itemId])).rows;}
  if(kind==='item-levels'){permit(a,'catalog.read');const itemId=await resolveItemId(this.db,q.item_id);return(await this.db.query('SELECT * FROM item_levels WHERE item_id=$1 AND ($2::uuid[] IS NULL OR warehouse_id=ANY($2))',[itemId,a.all_warehouses?null:a.warehouse_ids])).rows;}
  if(kind==='users')return this.auth.users(a);
  if(kind==='roles'){permit(a,'users');return(await this.db.query('SELECT * FROM roles ORDER BY name')).rows;}
  if(kind==='sessions'){return(await this.db.query('SELECT token_hash AS id,device,created_at,last_seen,expires_at,revoked FROM sessions WHERE user_id=$1 ORDER BY created_at DESC',[a.id])).rows;}
  if(kind==='changes'){
   const cursor=Math.max(0,Number(q.after)||0);const rows=(await this.db.query(`SELECT c.* FROM changes c LEFT JOIN documents d ON c.entity='documents' AND d.id::text=c.entity_id WHERE c.id>$1 AND ($2::uuid[] IS NULL OR c.warehouse_id IS NULL OR c.warehouse_id=ANY($2)) AND (c.entity<>'documents' OR ($4::boolean AND ($2::uuid[] IS NULL OR d.destination_warehouse_id IS NULL OR d.destination_warehouse_id=ANY($2)) AND ($3::uuid[] IS NULL OR d.department_id IS NULL OR d.department_id=ANY($3)))) ORDER BY c.id LIMIT 250`,[cursor,a.all_warehouses?null:a.warehouse_ids,a.all_departments?null:a.department_ids,a.permissions.includes('stock.read')])).rows;
   return{changes:rows,cursor:rows.length?rows[rows.length-1].id:cursor,checked_at:new Date().toISOString()};
  }
  if(kind==='reports')return this.report(this.db,a,id||'balances',q);
  if(kind==='dashboard')return this.dashboard(a,q);
  if(kind==='audit'){permit(a,'users');if(!a.all_warehouses||!a.all_departments)fail('SCOPE','مراجعة سجل النظام الكامل تتطلب نطاق إدارة كامل',403);return(await this.db.query('SELECT * FROM audit ORDER BY id DESC LIMIT 200')).rows;}
  fail('NOT_FOUND','المسار غير موجود',404);
 }
 async mutate(a:Actor,key:string,path:string,body:any,sessionHash?:string){
  return this.write(a,key,path,body,async(tx,current)=>{
   const [kind,id,action]=path.split('/').filter(Boolean);
   if(['warehouses','locations','categories','items','masters','lots','conversions'].includes(kind!)){if(action==='delete'&&id)return this.catalog.delete(tx,current,kind!,id);return this.catalog.save(tx,current,kind!,body,id);}
   if(kind==='users')return this.auth.saveUser(tx,current,body,id);
   if(kind==='roles')return this.auth.saveRole(tx,current,body);
   if(kind==='attachments')return this.attachments.upload(tx,current,body);
   if(['purchase-orders','counts','imports','serials','item-levels','item-codes','settings'].includes(kind!))return this.workflows.mutate(tx,current,kind!,id,action,body);
   if(kind==='sessions'&&id&&action==='revoke'){await tx.query('UPDATE sessions SET revoked=true WHERE user_id=$1 AND token_hash=$2',[a.id,id]);return{ok:true};}
   if(kind==='documents'){
    if(action==='reverse')return this.stock.reverse(tx,current,id!,body.reason,z.number().int().positive().parse(body.version));
    if(action)return this.stock.action(tx,current,id!,action,z.number().int().positive().parse(body.version));
    return this.stock.save(tx,current,body,id);
   }
   fail('NOT_FOUND','المسار غير موجود',404);
  },sessionHash);
 }
 async report(tx:SQL,a:Actor,kind:string,q:Record<string,string>){
  permit(a,'reports');permit(a,'stock.read');if(q.warehouse_id)warehouse(a,uuid.parse(q.warehouse_id));
  const scope=q.warehouse_id?[q.warehouse_id]:a.all_warehouses?null:a.warehouse_ids;
  const limit=Math.min(1000,Math.max(1,Number(q.limit)||200)),offset=Math.min(100000,Math.max(0,Number(q.offset)||0)),itemId=await resolveItemId(tx,q.item_id);
  if(kind==='balances')return visible((await tx.query(`SELECT b.*,i.sku,i.name_ar,i.name_en,i.base_unit,w.name warehouse_name,l.name location_name,lot.code lot_code,lot.expires_on,lot.notes lot_notes,
   CASE WHEN b.quality='Accepted' AND b.condition NOT IN('Repair','Damaged') AND b.holder_id IS NULL AND b.transit_id IS NULL AND (lot.expires_on IS NULL OR lot.expires_on>=CURRENT_DATE) THEN b.quantity-b.reserved ELSE 0 END available,
   CASE WHEN c.unpriced_quantity=0 AND c.quantity>0 THEN b.quantity*c.value/c.quantity END value
   FROM balances b JOIN items i ON i.id=b.item_id JOIN warehouses w ON w.id=b.warehouse_id LEFT JOIN locations l ON l.id=b.location_id LEFT JOIN lots lot ON lot.id=b.lot_id LEFT JOIN costs c ON c.item_id=b.item_id
   WHERE ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1)) AND ($2::uuid IS NULL OR b.item_id=$2) AND b.quantity>0 ORDER BY i.sku,w.name,b.position_key LIMIT $3 OFFSET $4`,[scope,itemId,limit,offset])).rows,a);
  if(kind==='ledger')return visible((await tx.query(`SELECT l.id,l.document_id,l.quantity,l.unit_cost,l.posted_at,d.number,d.type,d.document_date,d.reason,d.department_id,d.machine_id,i.sku,i.name_ar,i.base_unit,w.name warehouse_name,b.quality,b.condition
   FROM ledger l JOIN documents d ON d.id=l.document_id JOIN balances b ON b.position_key=l.position_key JOIN items i ON i.id=b.item_id JOIN warehouses w ON w.id=b.warehouse_id
   WHERE ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1)) AND ($2::uuid IS NULL OR b.item_id=$2) AND ($3::uuid[] IS NULL OR d.department_id IS NULL OR d.department_id=ANY($3))
   AND ($4::date IS NULL OR d.document_date>=$4) AND ($5::date IS NULL OR d.document_date<=$5) ORDER BY l.id DESC LIMIT $6 OFFSET $7`,[scope,itemId,a.all_departments?null:a.department_ids,q.from||null,q.to||null,limit,offset])).rows,a);
  if(kind==='custody')return(await tx.query(`SELECT c.*,i.sku,i.name_ar,m.name holder_name,d.warehouse_id FROM custody c JOIN document_lines l ON l.id=c.line_id JOIN items i ON i.id=l.item_id JOIN documents d ON d.id=c.document_id JOIN masters m ON m.id=c.holder_id WHERE ($1::uuid[] IS NULL OR d.warehouse_id=ANY($1)) ORDER BY c.due_on,c.id LIMIT $2 OFFSET $3`,[scope,limit,offset])).rows;
  fail('REPORT','التقرير غير موجود',404);
 }
 async dashboard(a:Actor,q:Record<string,string>){
  permit(a,'reports');permit(a,'stock.read');if(q.warehouse_id)warehouse(a,uuid.parse(q.warehouse_id));const scope=q.warehouse_id?[q.warehouse_id]:a.all_warehouses?null:a.warehouse_ids;
  const counts=await one(this.db,`SELECT count(DISTINCT b.item_id)::int active_skus,count(*) FILTER(WHERE b.quality='Under Inspection')::int inspection_positions,count(*) FILTER(WHERE lot.expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int expiring_positions FROM balances b LEFT JOIN lots lot ON lot.id=b.lot_id WHERE b.quantity>0 AND ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1))`,[scope]);
  const pending=await one(this.db,`SELECT count(*)::int n FROM documents WHERE status IN ('Submitted','Pending Approval') AND ($1::uuid[] IS NULL OR warehouse_id=ANY($1)) AND ($2::uuid[] IS NULL OR department_id IS NULL OR department_id=ANY($2))`,[scope,a.all_departments?null:a.department_ids]);
  const financial=a.permissions.includes('cost.read')?await one(this.db,`SELECT sum(CASE WHEN b.holder_id IS NULL AND b.transit_id IS NULL AND c.quantity>0 AND c.unpriced_quantity=0 THEN b.quantity*c.value/c.quantity ELSE 0 END) stock_value,sum(CASE WHEN b.holder_id IS NOT NULL AND c.quantity>0 AND c.unpriced_quantity=0 THEN b.quantity*c.value/c.quantity ELSE 0 END) custody_value,count(DISTINCT CASE WHEN c.unpriced_quantity>0 THEN b.item_id END)::int unpriced_items FROM balances b JOIN costs c ON c.item_id=b.item_id WHERE b.quantity>0 AND ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1))`,[scope]):undefined;
  const movement=(await this.db.query(`SELECT d.document_date,d.type,i.base_unit,sum(l.quantity) quantity${a.permissions.includes('cost.read')?',sum(l.quantity*l.unit_cost) value':''} FROM ledger l JOIN documents d ON d.id=l.document_id JOIN balances b ON b.position_key=l.position_key JOIN items i ON i.id=b.item_id WHERE d.type IN('receipt','issue','return') AND d.document_date>=CURRENT_DATE-30 AND ($1::uuid[] IS NULL OR b.warehouse_id=ANY($1)) AND ($2::uuid[] IS NULL OR d.department_id IS NULL OR d.department_id=ANY($2)) GROUP BY d.document_date,d.type,i.base_unit ORDER BY d.document_date`,[scope,a.all_departments?null:a.department_ids])).rows;
  return{...counts,pending_documents:pending!.n,...(financial?{financial}:{}),movement,metrics:[{id:'stock',report:'balances'},{id:'movement',report:'ledger'},{id:'custody',report:'custody'}],as_of:new Date().toISOString(),movement_period_days:30};
 }
}
