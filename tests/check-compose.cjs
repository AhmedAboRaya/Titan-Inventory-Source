const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),yaml=require('js-yaml');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'../..');
for(const file of [path.join(root,'deploy/compose.yaml'),path.join(workspace,'web/deploy/private/inventory-0.1.0/titan-inventory/compose.yaml')]){
 const d=yaml.load(fs.readFileSync(file,'utf8'));
 assert.deepEqual(d.services.db.networks,['private']);assert(d.networks.private.internal&&d.networks.gateway.internal);assert(!d.services.db.ports&&!d.services.api.ports);
 for(const [name,s]of Object.entries(d.services)){
  assert.equal(s.cpu_shares,512);assert(!('cpus'in s));assert.equal(s.mem_limit,name==='db'?'384m':'512m');assert(s.pids_limit);assert(s.security_opt.includes('no-new-privileges:true'));
  if(name!=='db'){assert.deepEqual(s.tmpfs,['/tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000']);assert(s.read_only);assert.deepEqual(s.cap_drop,['ALL']);}
 }
 assert(d.services.api.secrets.includes('inventory_setup'));assert.equal(d.services.api.build.target,'runtime');assert.equal(d.services.backup.build.target,'maintenance');
 console.log(path.relative(workspace,file)+': semantic checks PASS');
}
console.log('NAS kernel reports pids_limit unsupported/discarded; these tests do not claim enforcement.');
