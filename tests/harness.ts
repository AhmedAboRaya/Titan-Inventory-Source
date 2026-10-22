import { PGlite } from '@electric-sql/pglite';
import { Database, SQL, migrate } from '../server/db';
import { seed } from '../server/seed';
import { Inventory } from '../server/service';
import { Actor, randomUUID } from '../server/common';
// Actual PostgreSQL engine compiled to WASM, one connection. This does NOT prove
// independent Postgres sessions/locks or NAS durability; those require PG tests.
export class TestDatabase implements Database{
 readonly pg=new PGlite();private tail:Promise<unknown>=Promise.resolve();
 async query<T=any>(text:string,values:any[]=[]):Promise<{rows:T[],rowCount:number|null}>{
  if(!values.length&&text.includes(';')){const results=await this.pg.exec(text);const r=results.at(-1);return{rows:(r?.rows||[]) as T[],rowCount:r?.affectedRows||null};}
  const r=await this.pg.query<T>(text,values);return{rows:r.rows,rowCount:r.affectedRows||null};
 }
 async transaction<T>(work:(db:SQL)=>Promise<T>):Promise<T>{
  const current=this.tail.then(()=>this.pg.transaction(async tx=>{
   const adapter:SQL={query:async<T=any>(sql:string,values:any[]=[])=>{
    if(!values.length&&sql.includes(';')){const list=await tx.exec(sql);return{rows:(list.at(-1)?.rows||[])as T[]};}
    const r=await tx.query<T>(sql,values);return{rows:r.rows,rowCount:r.affectedRows};
   }};return work(adapter);
  }));this.tail=current.catch(()=>{});return current;
 }
 async close(){await this.tail;await this.pg.close();}
}
export async function fixture(){
 const db=new TestDatabase();await migrate(db);await seed(db);const app=new Inventory(db);
 const {id}=await app.auth.bootstrap('admin','TEST-only-password-4821','Test Admin');const admin=await app.auth.actor(db,id);
 const write=(path:string,body:any,a:Actor=admin,key=randomUUID())=>app.mutate(a,key,path,body);
 const w=await write('warehouses',{name:'Fixture Warehouse'}),dep=await write('masters',{kind:'department',name:'Fixture Production'});
 const category=(await app.catalog.list(db,admin,'categories')).find((c:any)=>c.parent_id);
 const item=await write('items',{sku:'TEST-001',name_ar:'صنف اختبار',category_id:category.id,base_unit:'Piece',precision:0,tracking:'consumable'});
 const draft=(type:string,quantity:string,extras:any={},line:any={})=>({type,document_date:'2026-10-18',warehouse_id:w.id,reason:'Isolated test',department_id:dep.id,lines:[{item_id:item.id,quantity,unit:'Piece',...line}],...extras});
 const post=async(type:string,quantity:string,extras:any={},line:any={})=>{
  let d=await write('documents',draft(type,quantity,extras,line));d=await write(`documents/${d.id}/submit`,{version:d.version});if(d.status==='Pending Approval')throw Error('Test helper requires ordinary document');return write(`documents/${d.id}/post`,{version:d.version});
 };
 return{db,app,admin,write,w,dep,item,draft,post};
}
