import test from 'node:test';import assert from 'node:assert/strict';import supertest from 'supertest';import{fixture,TestDatabase}from './harness';import{migrate}from '../server/db';import{seed}from '../server/seed';import{hash,randomUUID}from '../server/common';
// Test the compiled NestJS decorators rather than an alternate HTTP test double.
const {createApp}=require('../dist/server/http.js');
const {Inventory}=require('../dist/server/service.js');
test('actual Nest API requires cookie, Origin, CSRF and idempotency; logout revokes',async()=>{
 const f=await fixture();const app=await createApp(new Inventory(f.db),{publicOrigin:'http://127.0.0.1:18996',basePath:'/inventory'});
 try{
  const request=supertest.agent(app.getHttpServer());const base='/inventory/v1/';
  assert.equal((await request.get(base+'items')).status,401);
  assert.equal((await request.post(base+'auth/login').send({username:'admin',password:'TEST-only-password-4821'})).status,403);
  const login=await request.post(base+'auth/login').set('Origin','http://127.0.0.1:18996').send({username:'admin',password:'TEST-only-password-4821'});assert.equal(login.status,201===login.status?201:200);assert.ok(login.body.csrf);assert.ok(login.body.expiresAt);assert.match(login.headers['set-cookie'][0],/HttpOnly/);
  const csrf=login.body.csrf;assert.equal((await request.get(base+'items')).status,200);
  const bad=await request.post(base+'warehouses').set('Origin','http://127.0.0.1:18996').send({name:'Bad'});assert.equal(bad.status,403);
  const logout=await request.post(base+'auth/logout').set('Origin','http://127.0.0.1:18996').set('x-csrf-token',csrf).send({});assert.equal(logout.status,200);
  assert.equal((await request.get(base+'auth/me')).status,401);
 }finally{await app.close();await f.db.close();}
});

test('native-compatible first-admin HTTP setup is token-gated, one-time, and never establishes a login',async()=>{
 const db=new TestDatabase();await migrate(db);await seed(db);const secret='synthetic-setup-token-'+randomUUID(),origin='https://inventory.example.invalid';
 const app=await createApp(new Inventory(db),{publicOrigin:origin,basePath:'/inventory',setupHash:hash(secret)}),request=supertest(app.getHttpServer()),base='/inventory/v1/';
 const body={username:'first-admin',display_name:'Fixture only',password:'Synthetic-only-password-4821',setup_token:secret};
 try{
  assert.equal((await request.get(base+'auth/status')).body.initialized,false);
  assert.equal((await request.post(base+'auth/setup').send(body)).status,403);
  assert.equal((await request.post(base+'auth/setup').set('Origin',origin).send({...body,setup_token:'wrong-synthetic-token-48214821'})).status,403);
  const setup=await request.post(base+'auth/setup').set('Origin',origin).send(body);assert.equal(setup.status,200);assert.equal(setup.body.initialized,true);assert.equal(setup.headers['set-cookie'],undefined);
  assert.equal((await db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM balances')).rows[0].n,0);
  assert.equal((await request.post(base+'auth/setup').set('Origin',origin).send({...body,username:'replacement'})).status,409);assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,1);
  const login=await request.post(base+'auth/login').set('Origin',origin).send({username:body.username,password:body.password,device:'Synthetic native bridge'});assert.equal(login.status,200);
  const cookie=login.headers['set-cookie'][0];assert.match(cookie,/Path=\/inventory\//);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
  const me=await request.get(base+'auth/me').set('Cookie',cookie.split(';')[0]);assert.equal(me.status,200);assert.equal(me.body.actor.id,setup.body.id);assert.equal(me.body.expiresAt,login.body.expiresAt);assert.ok(me.body.csrf);assert.ok(me.body.instance);
 }finally{await app.close();await db.close();}
});

test('published OpenAPI describes actual bootstrap, scoped reads and replay-safe commands',async()=>{
 const f=await fixture(),app=await createApp(new Inventory(f.db),{publicOrigin:'http://127.0.0.1:18996',basePath:'/inventory'});
 try{
  const response=await supertest(app.getHttpServer()).get('/inventory/api-docs-json');assert.equal(response.status,200);const doc=response.body,p='/inventory/v1/';
  assert.equal(doc.components.securitySchemes.cookie.name,'titan_inventory');assert.deepEqual(doc.paths[p+'auth/setup'].post.security,[]);
  assert.deepEqual(doc.paths[p+'auth/me'].get.security,[{cookie:[]}]);assert.equal(doc.components.schemas.Setup.properties.password.writeOnly,true);assert.equal(doc.components.schemas.Setup.properties.setup_token.writeOnly,true);
  for(const route of ['documents','documents/{id}/post','attachments'])assert(doc.paths[p+route].post.parameters.some((h:any)=>h.name==='Idempotency-Key'&&h.required));
  assert(doc.paths[p+'documents/{id}/post'].post.parameters.some((h:any)=>h.name==='X-CSRF-Token'&&h.required));assert(!doc.paths[p+'auth/logout'].post.parameters.some((h:any)=>h.name==='Idempotency-Key'));
  assert(doc.paths[p+'exports/{kind}'].get);assert(doc.paths[p+'auth/passkey/verify'].post);assert(doc.paths[p+'passkeys/verify'].post);
 }finally{await app.close();await f.db.close();}
});

test('HTTP session enforces current warehouse/cost scopes and ignores another module cookie',async()=>{
 const f=await fixture(),origin='http://127.0.0.1:18996',app=await createApp(new Inventory(f.db),{publicOrigin:origin,basePath:'/inventory'}),request=supertest(app.getHttpServer()),base='/inventory/v1/';
 try{
  const hidden=await f.write('warehouses',{name:'Hidden HTTP fixture'});await f.post('receipt','3',{}, {unit_cost:'123'});await f.post('receipt','7',{warehouse_id:hidden.id},{unit_cost:'999'});
  const role='http-'+randomUUID();await f.write('roles',{id:role,name:'HTTP scoped reader',permissions:['catalog.read','stock.read','reports']});const user=await f.write('users',{username:'scoped-http',display_name:'Fixture scoped reader',password:'Synthetic-scope-password-4821',role_id:role,warehouse_ids:[f.w.id],department_ids:[f.dep.id]});
  const login=await request.post(base+'auth/login').set('Origin',origin).send({username:'scoped-http',password:'Synthetic-scope-password-4821'});assert.equal(login.status,200);const cookie=login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request.get(base+'auth/me').set('Cookie',cookie.replace('titan_inventory=','titan_injection='))).status,401);
  const item=await request.get(base+'items/'+f.item.id).set('Cookie',cookie);assert.equal(item.status,200);assert.equal(item.body.costs,undefined);assert.equal(item.body.positions.length,1);assert.equal(item.body.positions[0].warehouse_id,f.w.id);
  const report=await request.get(base+'reports/balances').set('Cookie',cookie);assert.equal(report.status,200);assert.equal(report.body.length,1);assert.equal(report.body[0].value,undefined);
  assert.equal((await request.get(base+'reports/balances?warehouse_id='+hidden.id).set('Cookie',cookie)).status,403);
  await f.db.query("UPDATE users SET warehouse_ids='{}',version=version+1 WHERE id=$1",[user.id]);assert.equal((await request.get(base+'reports/balances').set('Cookie',cookie)).body.length,0);
  await f.db.query('UPDATE users SET active=false WHERE id=$1',[user.id]);assert.equal((await request.get(base+'auth/me').set('Cookie',cookie)).status,401);
 }finally{await app.close();await f.db.close();}
});
