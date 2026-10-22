// Actual compiled Nest endpoint, disposable PGlite only. No external server.
import { fixture } from './harness';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const {createApp}=require('../dist/server/http.js');
const {Inventory}=require('../dist/server/service.js');
(async()=>{
 const f=await fixture();let app:any;
 try{
  const category=(await f.app.catalog.list(f.db,f.admin,'categories')).find((c:any)=>c.parent_id);
  const item=await f.write('items',{sku:'UI-NEW-001',name_ar:'صنف واجهة اختبار',category_id:category.id,base_unit:'Piece',precision:0,tracking:'consumable'});
  await f.post('receipt','10',{}, {item_id:item.id});await f.post('issue','3',{}, {item_id:item.id});
  await f.write('users',{username:'auditor',display_name:'Fixture Auditor',password:'TEST-only-auditor-4821',role_id:'auditor',warehouse_ids:[f.w.id],department_ids:[f.dep.id],all_warehouses:false,all_departments:false});
  const origin='http://127.0.0.1:19016';app=await createApp(new Inventory(f.db),{publicOrigin:origin,basePath:'/inventory',publicDir:resolve('dist/web')});await app.listen(19016,'127.0.0.1');
  for(const role of ['admin','auditor']){
   const login=await fetch(origin+'/inventory/v1/auth/login',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify({username:role,password:role==='admin'?'TEST-only-password-4821':'TEST-only-auditor-4821'})});
   if(!login.ok)throw Error('Login failed '+login.status);
   const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
   const response=await fetch(origin+'/inventory/v1/exports/balances',{headers:{cookie}});
   if(!response.ok)throw Error('Export failed '+response.status);
   const result=await response.json() as any;
   await writeFile(resolve('../../review/inventory-output',`balances-${role}.xlsx`),Buffer.from(result.data,'base64'));
  }
  await writeFile(resolve('../../review/inventory-output/export-capture.json'),JSON.stringify({ok:true,compiledServer:true,origin,syntheticOnly:true,quantity:7,unpriced:true,upstream:false},null,2));
  console.log('Captured latest compiled server XLSX admin/auditor on disposable loopback fixture');
 }finally{if(app)await app.close();await f.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
