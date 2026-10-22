// Runs the compiled UI with a synthetic native bridge. No production traffic/accounts.
const {chromium}=require('C:/Users/zokar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../dist/web'),results=[];
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/inventory\//,'')||'index.html',file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const scenario of ['fresh','expired','revoked','local','biometric','enroll','switch-account','wrong-local-password','expires-at-submit','setup','web']){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(({scenario})=>{
   localStorage.setItem('inventory.language','en');window.qaCalls=[];
   const valid=['local','biometric','switch-account','wrong-local-password','expires-at-submit'].includes(scenario);
   window.qaStatus={locked:true,localUnlockAvailable:valid,biometricEnabled:scenario==='biometric',previousUsername:scenario==='fresh'?'':'qa'};
   const session={locked:false,actor:{id:'00000000-0000-4000-8000-000000000001',username:'qa',display_name:'Synthetic QA',permissions:['catalog.read'],warehouse_ids:[],department_ids:[],role_id:'qa',version:1,all_warehouses:false,all_departments:false},instance:{id:'qa'},csrf:'synthetic',expiresAt:new Date(Date.now()+3600000).toISOString(),nativeScope:'qa'};
   window.qaHandle=q=>{
    window.qaCalls.push({action:q.action,path:q.path});
    if(q.action==='status')return {body:{...window.qaStatus}};
    if(q.action==='lock'){window.qaStatus.locked=true;queueMicrotask(()=>window.dispatchEvent(new CustomEvent('titan:inventory-locked')));return{body:{locked:true}}}
    if(q.action==='unlockPassword'&&scenario==='wrong-local-password')return{status:401,body:{error:{code:'LOCKED',message:'Synthetic wrong password'}}};
    if(q.action==='unlockPassword'||q.action==='unlockBiometric'||q.path==='/v1/auth/login'){window.qaStatus={...window.qaStatus,...session,localUnlockAvailable:true,previousUsername:'qa'};return{body:session}}
    if(q.action==='enableBiometric'){if(q.accountId!==session.actor.id||q.scope!==session.nativeScope)throw Error('Biometric enrollment omitted account binding');return{body:{...session,biometricEnabled:true}};}
    if(q.path==='/v1/auth/status')return{body:{initialized:scenario!=='setup'}};
    if(q.path==='/v1/auth/me')return window.qaStatus.locked?{status:401,body:{error:{message:'Sign in'}}}:{body:session};
    if(q.action==='cacheGet')return{body:{value:null}};
    if(q.action==='cacheSet')return{body:{saved:true}};
    return{body:[]};
   };
   if(scenario!=='web')window.TitanInventory={request(raw){const q=JSON.parse(raw),r=window.qaHandle(q);setTimeout(()=>window.dispatchEvent(new CustomEvent('titan:inventory-response',{detail:{id:q.id,status:r.status||200,body:r.body}})),0)}};
  },{scenario});
  if(scenario==='web')await context.route('**/inventory/v1/**',async route=>{const q={path:new URL(route.request().url()).pathname.replace('/inventory','')},r=await route.request().frame().evaluate(q=>window.qaHandle(q),q);await route.fulfill({status:r.status||200,json:r.body})});
  const page=await context.newPage();await page.goto(base+'/inventory/');
  if(scenario==='setup'){await page.getByRole('button',{name:'Create first administrator',exact:true}).waitFor();}
  else{
   if(scenario!=='web')await page.getByRole('button',{name:'Sign in with biometrics',exact:true}).waitFor();
   if(scenario==='fresh'){await page.getByRole('button',{name:'Sign in with biometrics',exact:true}).click();await page.getByText('Sign in with your password and enable biometrics for this device.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qaCalls.filter(q=>q.action==='unlockBiometric').length),0);}
   await page.locator('[name=username]').fill(scenario==='switch-account'?'different-qa':'qa');
   await page.locator('[name=password]').fill('synthetic test only');
   if(scenario==='expires-at-submit')await page.evaluate(()=>window.qaStatus.localUnlockAvailable=false);
   if(scenario==='enroll')await page.getByLabel('Enable biometrics after sign in',{exact:true}).check();
   await page.getByRole('button',{name:scenario==='biometric'?'Sign in with biometrics':'Sign in',exact:true}).click();
   if(scenario==='wrong-local-password')await page.getByText('Synthetic wrong password',{exact:true}).waitFor();
   else await page.locator('.workspace').waitFor();
   const calls=await page.evaluate(()=>window.qaCalls);
   const offline=['local','wrong-local-password'].includes(scenario);
   assert.equal(calls.filter(q=>q.action==='unlockPassword').length,offline?1:0,scenario);
   assert.equal(calls.filter(q=>q.path==='/v1/auth/login').length,offline||scenario==='biometric'?0:1,scenario);
   if(scenario==='biometric')assert.equal(calls.filter(q=>q.action==='unlockBiometric').length,1);
   if(scenario==='enroll'){
    assert.equal(calls.filter(q=>q.action==='enableBiometric').length,1);
    await page.setViewportSize({width:1280,height:900});await page.getByRole('button',{name:'My account',exact:true}).click();
    assert.equal(await page.getByText('Sessions and devices',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.qaCalls.filter(q=>q.path==='/v1/sessions').length),0);
   }
   if(scenario==='local'){
    await page.setViewportSize({width:1280,height:900});
    await page.locator('.sidebar-bottom button').click();await page.getByRole('heading',{name:'Welcome back',exact:true}).waitFor();
    // An event must not echo another native lock (the old implementation looped).
    await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.qaCalls.filter(q=>q.action==='lock').length),1);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('titan:inventory-locked')));
    await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.qaCalls.filter(q=>q.action==='lock').length),1);
   }
  }
  results.push({scenario,passed:true});await context.close();
 }
 const report=path.resolve(__dirname,'../../../review/inventory-login-0.5.2-ui.json');fs.writeFileSync(report,JSON.stringify({passed:true,compiledUi:true,productionRequests:0,results},null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
