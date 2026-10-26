import { createHash,randomUUID } from 'node:crypto';import {mkdir,writeFile,readFile,rename,stat}from 'node:fs/promises';import{join,resolve,sep}from 'node:path';
import sharp from 'sharp';import {SQL,one}from './db';import{Actor,permit,warehouse,department,fail,z,uuid,text,nullableId}from './common';
export class Attachments{
 readonly root:string;constructor(root:string){this.root=resolve(root);}
 private async authorize(tx:SQL,a:Actor,attachment:any,write=false){
  permit(a,write?'catalog.write':'catalog.read');
  if(attachment.warehouse_id)warehouse(a,attachment.warehouse_id);
  if(attachment.document_id){const doc=await one(tx,'SELECT * FROM documents WHERE id=$1',[attachment.document_id]);if(!doc)fail('DOCUMENT','المستند غير موجود',404);warehouse(a,doc.warehouse_id);department(a,doc.department_id);if(doc.destination_warehouse_id)warehouse(a,doc.destination_warehouse_id);if(write&&['Posted','Reversed'].includes(doc.status))fail('IMMUTABLE','لا يمكن تعديل مرفقات حركة مُرحلة');}
  if(attachment.item_id&&!await one(tx,'SELECT 1 FROM items WHERE id=$1',[attachment.item_id]))fail('ITEM','الصنف غير موجود',404);
 }
 async upload(tx:SQL,a:Actor,body:unknown){
  const b=z.object({item_id:nullableId,document_id:nullableId,warehouse_id:nullableId,filename:text,mime:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),data:z.string().max(2000000),primary_image:z.boolean().default(false)}).strict().parse(body);
  if(!b.item_id&&!b.document_id)fail('ATTACHMENT','اربط المرفق بصنف أو مستند');await this.authorize(tx,a,b,true);
  if(b.primary_image&&(!b.item_id||b.document_id||b.warehouse_id||!b.mime.startsWith('image/')))fail('PRIMARY_IMAGE','الصورة الأساسية صورة عامة للصنف فقط، بدون ربط بمستند أو مخزن');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)||b.data.length%4)fail('FILE','ملف غير صالح');
  let bytes:Buffer=Buffer.from(b.data,'base64');let mime=b.mime as string,extension='pdf';if(bytes.length>1500000||!bytes.length)fail('FILE_SIZE','المرفق بعد الضغط يجب ألا يتجاوز 1.5 MB');
  let thumbnail:Buffer|undefined;
  if(b.mime.startsWith('image/')){
   try{const source=sharp(bytes,{limitInputPixels:20000000,animated:false});const metadata=await source.metadata();if(!['jpeg','png','webp'].includes(metadata.format||''))fail('FILE','نوع الصورة غير مسموح');bytes=await source.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();thumbnail=await sharp(bytes).resize({width:320,height:320,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer();mime='image/webp';extension='webp';}catch{fail('IMAGE','تعذر قراءة الصورة؛ اختر JPEG أو PNG أو WebP');}
  }else if(bytes.subarray(0,5).toString()!=='%PDF-')fail('PDF','ملف PDF غير صالح');
  const sha=createHash('sha256').update(bytes).digest('hex'),relative=sha.slice(0,2)+'/'+sha+'.'+extension,full=join(this.root,relative);await mkdir(join(this.root,sha.slice(0,2)),{recursive:true});
  // Content addressed immutable files make a retry safe; unreferenced files can
  // be collected after a grace period if the DB transaction later rolls back.
  try{await writeFile(full,bytes,{flag:'wx'});}catch(e:any){if(e.code!=='EEXIST')throw e;}
  if(thumbnail)try{await writeFile(full+'.thumb.webp',thumbnail,{flag:'wx'});}catch(e:any){if(e.code!=='EEXIST')throw e;}
  if(b.primary_image&&b.item_id)await tx.query('UPDATE attachments SET primary_image=false WHERE item_id=$1',[b.item_id]);
  // A single content file may be referenced by multiple authorized records.
  return(await tx.query('INSERT INTO attachments(item_id,document_id,warehouse_id,owner_id,filename,mime,bytes,sha256,path,primary_image) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,filename,mime,bytes,primary_image',[b.item_id||null,b.document_id||null,b.warehouse_id||null,a.id,b.filename,mime,bytes.length,sha,relative,b.primary_image])).rows[0];
 }
 async read(tx:SQL,a:Actor,id:string|undefined,q:Record<string,string>){
  if(id){const row=await one(tx,'SELECT * FROM attachments WHERE id=$1',[uuid.parse(id)]);if(!row)fail('NOT_FOUND','المرفق غير موجود',404);await this.authorize(tx,a,row);
   const path=resolve(this.root,row.path+(q.thumbnail==='1'&&row.mime.startsWith('image/')?'.thumb.webp':''));if(!path.startsWith(this.root+sep))fail('PATH','مسار مرفق غير صالح');
   const bytes=await readFile(path);return{id:row.id,filename:row.filename,mime:row.mime,bytes:bytes.length,data:bytes.toString('base64')};
  }
  if(!q.item_id&&!q.document_id)fail('REFERENCE','حدد الصنف أو المستند');
  let itemId=q.item_id;
  if(itemId&&!uuid.safeParse(itemId).success){
   const item=await one(tx,'SELECT id FROM items WHERE sku=$1',[itemId]);
   itemId=item?.id||null;
  }
  const scope={item_id:itemId?uuid.parse(itemId):undefined,document_id:q.document_id?uuid.parse(q.document_id):undefined};await this.authorize(tx,a,scope);
  return(await tx.query(`SELECT at.id,at.item_id,at.document_id,at.warehouse_id,at.filename,at.mime,at.bytes,at.sha256,at.primary_image FROM attachments at LEFT JOIN documents d ON d.id=at.document_id
   WHERE ($1::uuid IS NULL OR at.item_id=$1) AND ($2::uuid IS NULL OR at.document_id=$2)
   AND ($3::uuid[] IS NULL OR at.warehouse_id IS NULL OR at.warehouse_id=ANY($3))
   AND (at.document_id IS NULL OR (($3::uuid[] IS NULL OR (d.warehouse_id=ANY($3) AND (d.destination_warehouse_id IS NULL OR d.destination_warehouse_id=ANY($3)))) AND ($4::uuid[] IS NULL OR d.department_id IS NULL OR d.department_id=ANY($4))))
   ORDER BY at.primary_image DESC,at.created_at`,[scope.item_id||null,scope.document_id||null,a.all_warehouses?null:a.warehouse_ids,a.all_departments?null:a.department_ids])).rows;
 }
}
