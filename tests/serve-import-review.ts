// Disposable loopback fixture only; no production data or credentials.
import {fixture} from './harness';
import {resolve} from 'node:path';
const {createApp}=require('../dist/server/http.js');
(async()=>{
 const f=await fixture();
 const reviewer=await f.write('users',{username:'reviewer',display_name:'Fixture Reviewer',password:'TEST-only-reviewer-4821',role_id:'manager',warehouse_ids:[f.w.id],department_ids:[f.dep.id],all_warehouses:false,all_departments:false});
 const category=(await f.app.catalog.list(f.db,f.admin,'categories')).find((c:any)=>c.parent_id);
 const row=(sku:string,n:number)=>({source_row:n,original_text:'Synthetic isolated review row '+n,sku,name_ar:'اختبار معزول '+n,name_en:'Isolated test '+n,category_id:category.id,base_unit:'Piece',precision:0});
 const batch=await f.write('imports',{source:'QA import A',rows:[row('QA-IMPORT-A',1),row('QA-IMPORT-B',2),row('TEST-001',3)]});
 if(process.env.INVENTORY_QA_APPROVED_IMPORT==='1'){
   await f.write('imports/'+batch[0].id+'/approve',{selected_rows:[1,2]},await f.app.auth.actor(f.db,reviewer.id));
 }
 await f.write('imports',{source:'QA import B',rows:[row('QA-IMPORT-C',1)]});
 const app=await createApp(f.app,{publicOrigin:'http://127.0.0.1:19013',basePath:'/inventory',publicDir:resolve('dist/web')});
 app.getHttpAdapter().getInstance().get('/qa/import-metadata',async(_req:any,res:any)=>{
   const rows=(await f.db.query("SELECT sku,track_lot,data FROM items WHERE sku='QA-IMPORT-A'")).rows;
   res.json({rows,ok:rows.length===1&&rows[0].track_lot===true&&rows[0].data.source==='QA import A'&&rows[0].data.original_text==='Synthetic isolated review row 1'});
 });
 await app.listen(19013,'127.0.0.1');
 process.stdout.write(JSON.stringify({ready:true,pid:process.pid,url:'http://127.0.0.1:19013/inventory/',productionWrites:false})+'\n');
 for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,async()=>{await app.close();await f.db.close();process.exit(0)});
})().catch(e=>{console.error(e);process.exit(1)});
