import { Pool } from 'pg';
import { Postgres, migrate } from '../server/db';
import { seed } from '../server/seed';
import { Inventory } from '../server/service';
import { Actor, randomUUID } from '../server/common';
import {resolve} from 'node:path';

export async function postgresFixture(){
 const url=process.env.INVENTORY_TEST_POSTGRES_URL;
 if(!url)throw Error('Use tests/run-postgres.py to start an isolated local test cluster.');
 const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/postgres')throw Error('Test cluster must be explicit loopback /postgres.');
 const adminPool=new Pool({connectionString:url,max:3}),name='inv_test_'+randomUUID().replaceAll('-','');
 await adminPool.query('CREATE DATABASE '+name);
 const testURL=new URL(url);testURL.pathname='/'+name;const db=new Postgres(testURL.href),control=new Pool({connectionString:testURL.href,max:3});
 await migrate(db);await seed(db);const attachmentRoot=resolve('.local','attachments-'+name),app=new Inventory(db,attachmentRoot);
 const {id}=await app.auth.bootstrap('admin','TEST-only-password-4821','Test Admin');const admin=await app.auth.actor(db,id);
 const write=(path:string,body:any,a:Actor=admin,key=randomUUID())=>app.mutate(a,key,path,body);
 const w=await write('warehouses',{name:'Fixture Warehouse'}),dep=await write('masters',{kind:'department',name:'Fixture Production'});
 const category=(await app.catalog.list(db,admin,'categories')).find((c:any)=>c.parent_id);
 const item=await write('items',{sku:'TEST-001',name_ar:'صنف اختبار',category_id:category.id,base_unit:'Piece',precision:0,tracking:'consumable'});
 const approverId=(await write('users',{username:'approver',display_name:'Test approver',role_id:'admin',password:'TEST-only-approver-4821',warehouse_ids:[],department_ids:[],all_warehouses:true,all_departments:true})).id;
 const approver=await app.auth.actor(db,approverId);
 const draft=(type:string,quantity:string,extras:any={},line:any={})=>({type,document_date:'2026-10-18',warehouse_id:w.id,reason:'Isolated test',department_id:dep.id,lines:[{item_id:item.id,quantity,unit:'Piece',...line}],...extras});
 const finish=async(document:any)=>{let d=await write(`documents/${document.id}/submit`,{version:document.version});if(d.status==='Pending Approval')d=await write(`documents/${d.id}/approve`,{version:d.version},approver);return write(`documents/${d.id}/post`,{version:d.version});};
 const post=async(type:string,quantity:string,extras:any={},line:any={})=>finish(await write('documents',draft(type,quantity,extras,line)));
 const role=async(permissions:string[],warehouseIds=[w.id])=>{const suffix=randomUUID().slice(0,8),roleId='test-'+suffix;await write('roles',{id:roleId,name:'Fixture role',permissions});const user=await write('users',{username:'u-'+suffix,display_name:'Fixture user',role_id:roleId,password:'TEST-only-user-4821',warehouse_ids:warehouseIds,department_ids:[dep.id]});return app.auth.actor(db,user.id);};
 const close=async()=>{await control.end();await db.close();await adminPool.query('DROP DATABASE '+name);await adminPool.end();};
 return{db,control,app,admin,approver,write,w,dep,item,draft,finish,post,role,close,attachmentRoot,testURL:testURL.href,clusterURL:url};
}

export async function lockQueue(f:Awaited<ReturnType<typeof postgresFixture>>){
 const client=await f.control.connect();await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(84610418)');
 return{client,release:async()=>{await client.query('COMMIT');client.release();}};
}
export async function waitForBlocked(f:Awaited<ReturnType<typeof postgresFixture>>,count:number){
 const until=Date.now()+5000;
 while(Date.now()<until){const r=await f.control.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND application_name='titan-inventory'");if(r.rows[0].n>=count)return;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('Expected independent PostgreSQL connections blocked on the transaction advisory lock.');
}
