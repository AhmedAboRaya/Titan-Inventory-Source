const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..');
const entry=fs.readFileSync(path.join(root,'deploy/entrypoint.cjs'),'utf8'),maintenance=fs.readFileSync(path.join(root,'deploy/maintenance.cjs'),'utf8'),diagnostic=fs.readFileSync(path.join(workspace,'web/inventory-readonly-check.cjs'),'utf8');
const quiet={log(){},error(){}},synthetic='synthetic-database-password-32chars';
const cases=[['no newline',synthetic,synthetic],['LF',synthetic+'\n',synthetic],['CRLF',synthetic+'\r\n',synthetic+'\r'],['multiple LF',synthetic+'\n\n\n',synthetic],['CRLF then LF',synthetic+'\r\n\n',synthetic+'\r'],['spaces preserved',' '+synthetic+' \n',' '+synthetic+' ']];
for(const [name,input,expected]of cases)test('all DB readers match init command substitution: '+name,async()=>{
 const fakeFS={readFileSync(){return input;},existsSync(){return false;}},processEntry={env:{},argv:['node','entrypoint.cjs']};let imported='';
 vm.runInNewContext(entry,{process:processEntry,require(id){if(id==='node:fs')return fakeFS;imported=id;return{};}});assert.equal(imported,'./dist/server/main.js');assert.equal(decodeURIComponent(new URL(processEntry.env.DATABASE_URL).password),expected);
 let backupURL='';const maintenanceContext={process:{argv:['node','maintenance.cjs','backup','synthetic-backup'],env:{}},console:quiet,require(id){if(id==='node:fs')return fakeFS;if(id==='node:path')return path;if(id==='./backup.cjs')return{backup:async options=>{backupURL=options.url;return{ok:true};}};throw Error('Unexpected import');}};
 vm.runInNewContext(maintenance.replace('main().catch','globalThis.done=main().catch'),maintenanceContext);await maintenanceContext.done;assert.equal(decodeURIComponent(new URL(backupURL).password),expected);
 let diagnosticURL='';const diagnosticContext={process:{},module:{exports:{}},console:quiet,require(id){if(id==='node:fs')return fakeFS;if(id==='pg')return{Pool:class{constructor(options){diagnosticURL=options.connectionString;}async connect(){throw Object.assign(Error('Synthetic stop before any DB'),{code:'TEST_STOP'});}async end(){}}};return require(id);}};
 vm.runInNewContext(diagnostic+'\nglobalThis.done=main();',diagnosticContext);await diagnosticContext.done;assert.equal(decodeURIComponent(new URL(diagnosticURL).password),expected);
 // A native POSIX shell also verifies its substitution contract. Windows MSYS Bash
 // performs CRLF translation and is not an accurate stand-in for the NAS /bin/sh.
 if(process.platform!=='win32'){const result=cp.spawnSync('/bin/sh',['-c','app_password=$(cat); printf \'%s\' "$app_password"'],{input,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,expected);}
});
test('deployment keeps shell initialization and staged readers consistent',()=>{
 const init=fs.readFileSync(path.join(root,'deploy/init-db.sh'),'utf8');assert(init.includes('app_password=$(cat /run/secrets/inventory_password)'));assert(!/\b(?:dos2unix|tr)\b/.test(init));
 for(const name of ['entrypoint.cjs','maintenance.cjs'])assert(fs.readFileSync(path.join(root,'deploy',name)).equals(fs.readFileSync(path.join(workspace,'web/deploy/private/inventory-0.1.0/titan-inventory/deploy',name))));
 assert(entry.includes("fs.readFileSync(setupFile,'utf8').trim()"),'The independent setup-token convention must remain unchanged');
});
