/* Isolated Vite builds only; never changes frozen dist, source, or APK inputs. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const moduleRoot=path.resolve(__dirname,'..'),workspace=path.resolve(moduleRoot,'../..'),stage=path.join(workspace,'web/deploy/private/inventory-0.1.0/titan-inventory');
const testRoot=path.join(moduleRoot,'.local','build-equivalence-'+crypto.randomUUID());fs.mkdirSync(testRoot,{recursive:true});
const cases=[];for(const mode of ['with-tsconfig','docker-omitted-tsconfig']){
 const root=path.join(testRoot,mode);fs.mkdirSync(root);
 for(const name of ['src','public','package.json','package-lock.json','index.html','vite.config.ts','tsconfig.server.json'])fs.cpSync(path.join(stage,name),path.join(root,name),{recursive:true});
 // An empty nearest config prevents inheriting the central parent's config and
 // reproduces esbuild's default TS options when Docker omits tsconfig.json.
 fs.writeFileSync(path.join(root,'tsconfig.json'),mode==='with-tsconfig'?fs.readFileSync(path.join(stage,'tsconfig.json')):'{"compilerOptions":{}}\n');
 const result=spawnSync(process.execPath,[path.join(moduleRoot,'node_modules/vite/bin/vite.js'),'build'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=384'}});
 fs.writeFileSync(path.join(root,'build.log'),(result.stdout||'')+(result.stderr||''));if(result.status!==0)throw Error(mode+' build failed; see isolated build.log');
 const assets=fs.readdirSync(path.join(root,'dist/web/assets')).map(name=>{const bytes=fs.readFileSync(path.join(root,'dist/web/assets',name));return{name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});cases.push({mode,assets,root});
}
const frozen=fs.readdirSync(path.join(moduleRoot,'dist/web/assets')).map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(moduleRoot,'dist/web/assets',name))).digest('hex')}));
const report={ok:true,isolatedBuilds:true,sourceChanged:false,cases,frozen,withConfigMatchesFrozen:cases[0].assets.every(file=>frozen.some(f=>f.name===file.name&&f.sha256===file.sha256)),omittedConfigMatchesObservedNAS:cases[1].assets.some(file=>file.name==='index-BJsnIfsi.js')};
fs.writeFileSync(path.join(workspace,'review/inventory-build-equivalence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
