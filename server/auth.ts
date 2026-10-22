import { Database, SQL, one } from './db';
import { Actor, fail, hash, passwordHash, token, verifyPassword, permit, z, uuid, text, json, PERMISSIONS } from './common';
export class Auth {
 constructor(readonly db:Database){}
 async actor(tx:SQL,id:string):Promise<Actor>{
  const row=await one(tx,`SELECT u.id,u.username,u.display_name,u.role_id,u.warehouse_ids,u.department_ids,u.all_warehouses,u.all_departments,u.version,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.active`,[id]);
  if(!row)fail('SESSION','انتهت صلاحية الحساب؛ سجّل الدخول مجددًا',401); return row;
 }
 async authenticate(raw:string|undefined):Promise<{actor:Actor,csrf:string,session:string,expiresAt:string}>{
  if(!raw||raw.length>100)fail('SESSION','سجّل الدخول أولًا',401);
  const row=await one(this.db,'SELECT * FROM sessions WHERE token_hash=$1 AND NOT revoked AND expires_at>now()',[hash(raw)]);
  if(!row)fail('SESSION','انتهت الجلسة؛ سجّل الدخول مجددًا',401);
  return {actor:await this.actor(this.db,row.user_id),csrf:row.csrf,session:hash(raw),expiresAt:new Date(row.expires_at).toISOString()};
 }
 async login(body:unknown,ip:string){
  const b=z.object({username:text,password:z.string().min(1).max(256),device:z.string().max(120).default('Web')}).strict().parse(body);
  const key=hash(`${ip}:${b.username.toLowerCase()}`);
  const attempt=await one(this.db,'SELECT * FROM login_attempts WHERE key=$1 AND reset_at>now()',[key]);
  if(attempt&&attempt.count>=10)fail('RATE_LIMIT','محاولات كثيرة؛ حاول بعد ربع ساعة',429);
  const user=await one(this.db,'SELECT * FROM users WHERE username=$1 AND active',[b.username.toLowerCase()]);
  const ok=await verifyPassword(b.password,user?.password_hash||'scrypt:00000000000000000000000000000000:'+ '00'.repeat(64));
  if(!ok||!user){await this.db.query(`INSERT INTO login_attempts(key,count,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.count+1 END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END`,[key]);fail('LOGIN','اسم المستخدم أو كلمة المرور غير صحيحة',401);}
  const raw=token(),csrf=token();
  const actor=await this.db.transaction(async tx=>{
   const latest=await one(tx,'SELECT password_hash,version FROM users WHERE id=$1 AND active',[user.id]);
   if(!latest||latest.password_hash!==user.password_hash||latest.version!==user.version)fail('LOGIN_CHANGED','بيانات الحساب تغيرت؛ سجّل الدخول مجددًا',401);
   const active=await this.actor(tx,user.id);
   await tx.query('DELETE FROM login_attempts WHERE key=$1',[key]);
   await tx.query("INSERT INTO sessions(token_hash,user_id,csrf,device,expires_at) VALUES($1,$2,$3,$4,now()+interval '12 hours')",[hash(raw),user.id,csrf,b.device]);
   await tx.query("INSERT INTO audit(user_id,action,target) VALUES($1,'login',$2)",[user.id,user.id]);return active;
  });
  const session=await one(this.db,'SELECT expires_at FROM sessions WHERE token_hash=$1',[hash(raw)]);
  return {raw,csrf,actor,expiresAt:new Date(session!.expires_at).toISOString(),instance:(await one(this.db,"SELECT value FROM settings WHERE key='instance'"))!.value};
 }
 async bootstrap(username:string,password:string,displayName:string){
  const encoded=await passwordHash(password);
  return this.db.transaction(async tx=>{
   if((await tx.query('SELECT id FROM users LIMIT 1')).rows.length)fail('INITIALIZED','تم إنشاء المدير بالفعل',409);
   return (await tx.query(`INSERT INTO users(username,display_name,password_hash,role_id,all_warehouses,all_departments) VALUES($1,$2,$3,'admin',true,true) RETURNING id`,[text.parse(username).toLowerCase(),text.parse(displayName),encoded])).rows[0];
  });
 }
 async setup(body:unknown,expectedHash:string){
  const b=z.object({username:text,display_name:text,password:z.string().min(12).max(256),setup_token:z.string().min(24).max(200)}).strict().parse(body);
  // The random one-time code exists only in the NAS operator secret file. A
  // bootstrap attempt never replaces users or grants access to existing apps.
  if(!/^[a-f0-9]{64}$/.test(expectedHash)||hash(b.setup_token)!==expectedHash)fail('SETUP_TOKEN','رمز إعداد المدير غير صحيح',403);
  const result=await this.bootstrap(b.username,b.password,b.display_name);return{initialized:true,id:result.id};
 }
 private manages(a:Actor,target:any){return (!target.permissions.some((p:string)=>!a.permissions.includes(p)))&&(a.all_warehouses||(!target.all_warehouses&&target.warehouse_ids.every((w:string)=>a.warehouse_ids.includes(w))))&&(a.all_departments||(!target.all_departments&&target.department_ids.every((d:string)=>a.department_ids.includes(d))));}
 async users(a:Actor){permit(a,'users');const rows=(await this.db.query('SELECT u.id,u.username,u.display_name,u.role_id,u.warehouse_ids,u.department_ids,u.all_warehouses,u.all_departments,u.active,u.version,r.permissions FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.username')).rows;return rows.filter(row=>this.manages(a,row)).map(({permissions,...row})=>row);}
 async saveUser(tx:SQL,a:Actor,body:unknown,id?:string){
  permit(a,'users');
  const b=z.object({username:text,display_name:text,role_id:text,password:z.string().min(12).max(256).optional(),warehouse_ids:z.array(uuid).max(100),department_ids:z.array(uuid).max(100),all_warehouses:z.boolean().default(false),all_departments:z.boolean().default(false),active:z.boolean().default(true),version:z.number().int().positive().optional()}).strict().parse(body);
  if(!a.all_warehouses&&(b.all_warehouses||b.warehouse_ids.some(w=>!a.warehouse_ids.includes(w))))fail('SCOPE','لا يمكن منح نطاق لا تملكه',403);
  if(!a.all_departments&&(b.all_departments||b.department_ids.some(d=>!a.department_ids.includes(d))))fail('SCOPE','لا يمكن منح نطاق لا تملكه',403);
  const role=await one(tx,'SELECT * FROM roles WHERE id=$1',[b.role_id]);if(!role||role.permissions.some((p:string)=>!a.permissions.includes(p)))fail('PERMISSIONS','لا يمكن منح صلاحيات أعلى من صلاحياتك',403);
  for(const w of b.warehouse_ids)if(!await one(tx,'SELECT 1 FROM warehouses WHERE id=$1',[w]))fail('WAREHOUSE','المخزن غير موجود');
  for(const d of b.department_ids)if(!await one(tx,"SELECT 1 FROM masters WHERE id=$1 AND kind='department'",[d]))fail('DEPARTMENT','القسم غير موجود');
  if(id){
   const old=await one(tx,'SELECT * FROM users WHERE id=$1',[uuid.parse(id)]);if(!old)fail('NOT_FOUND','المستخدم غير موجود',404);
   const oldRole=await one(tx,'SELECT permissions FROM roles WHERE id=$1',[old.role_id]);if(!this.manages(a,{...old,permissions:oldRole!.permissions}))fail('SCOPE','لا يمكنك تعديل مستخدم خارج نطاق إدارتك أو أعلى صلاحية',403);
   if(old.version!==b.version)fail('CONFLICT','المستخدم تغير على جهاز آخر',409);
   if(old.role_id==='admin'&&(b.role_id!=='admin'||!b.active)&&!(await one(tx,"SELECT 1 FROM users WHERE role_id='admin' AND active AND id<>$1",[id])))fail('LAST_ADMIN','لا يمكن تعطيل آخر مدير');
   await tx.query('UPDATE users SET username=$2,display_name=$3,role_id=$4,warehouse_ids=$5,department_ids=$6,all_warehouses=$7,all_departments=$8,active=$9,password_hash=$10,version=version+1 WHERE id=$1',[id,b.username.toLowerCase(),b.display_name,b.role_id,b.warehouse_ids,b.department_ids,b.all_warehouses,b.all_departments,b.active,b.password?await passwordHash(b.password):old.password_hash]);
   await tx.query('UPDATE sessions SET revoked=true WHERE user_id=$1',[id]);
  }else{
   if(!b.password)fail('PASSWORD','كلمة المرور مطلوبة');
   id=(await tx.query(`INSERT INTO users(username,display_name,password_hash,role_id,warehouse_ids,department_ids,all_warehouses,all_departments,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[b.username.toLowerCase(),b.display_name,await passwordHash(b.password),b.role_id,b.warehouse_ids,b.department_ids,b.all_warehouses,b.all_departments,b.active])).rows[0].id;
  }
  await tx.query("INSERT INTO audit(user_id,action,target,detail) VALUES($1,'user.save',$2,$3)",[a.id,id,json({role:b.role_id,active:b.active})]);return{id};
 }
 async saveRole(tx:SQL,a:Actor,body:unknown){
  permit(a,'users');if(!a.all_warehouses||!a.all_departments||PERMISSIONS.some(p=>!a.permissions.includes(p)))fail('ROLE_ADMIN','إدارة الأدوار المشتركة تتطلب مدير النظام الكامل',403);const b=z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),name:text,permissions:z.array(z.enum(PERMISSIONS))}).strict().parse(body);
  if(b.id==='admin')fail('ROLE','صلاحيات المدير الأساسي ثابتة');
  if(b.permissions.some(p=>!a.permissions.includes(p)))fail('PERMISSIONS','لا يمكن منح صلاحيات لا تملكها',403);
  await tx.query('INSERT INTO roles(id,name,permissions) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,permissions=$3',[b.id,b.name,b.permissions]);
  await tx.query('UPDATE sessions SET revoked=true WHERE user_id IN (SELECT id FROM users WHERE role_id=$1)',[b.id]);return{id:b.id};
 }
}
