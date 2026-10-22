/* Explicit operator tooling. Requires Node 24, pg dependency, and PostgreSQL 17 client tools. */
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{Pool}=require('pg');
function pgEnvironment(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGSSLMODE:u.searchParams.get('sslmode')||'prefer'};}
async function command(executable,args,env,cwd){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{env,cwd,windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';const timeout=setTimeout(()=>{child.kill();reject(Error(path.basename(executable)+' exceeded the 15-minute operation limit.'));},15*60*1000);child.stderr.on('data',chunk=>{if(error.length<8000)error+=chunk;});child.on('error',e=>{clearTimeout(timeout);reject(e);});child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error(path.basename(executable)+' failed ('+code+'): '+error));});});}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fileSha(file){const digest=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))digest.update(chunk);return digest.digest('hex');}
const tool=(bin,name)=>path.join(bin,name+(process.platform==='win32'?'.exe':''));
async function fingerprint(db){
 await db.query("SET TIME ZONE 'UTC'");
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result={};for(const {tablename:name}of tables){if(!/^[a-z_][a-z0-9_]*$/.test(name))throw Error('Unexpected table name');const row=(await db.query(`SELECT count(*)::text rows,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) fingerprint FROM "${name}" t`)).rows[0];result[name]=row;}return result;
}
async function backup({url,bin,output,attachments}){
 if(!url||!bin||!output||!attachments)throw Error('DATABASE_URL, PG_BIN, output, and attachment directory are required.');
 const target=path.resolve(output);try{await fs.stat(target);throw Error('Backup destination already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const pending=target+'.incomplete-'+crypto.randomUUID();await fs.mkdir(pending,{recursive:true});const pool=new Pool({connectionString:url,max:1}),client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot=(await client.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
  const tables=await fingerprint(client),files=(await client.query('SELECT DISTINCT path,sha256,mime FROM attachments ORDER BY path')).rows;
  // A relative filename also supports Windows PostgreSQL binaries in a Unicode workspace.
  await command(tool(bin,'pg_dump'),['--format=custom','--no-owner','--no-privileges','--snapshot='+snapshot,'--file=database.dump'],pgEnvironment(url),pending);
  const assets=[];for(const row of files){for(const relative of [row.path,...(row.mime.startsWith('image/')?[row.path+'.thumb.webp']:[])]){
    const root=path.resolve(attachments),source=path.resolve(root,relative);if(!source.startsWith(root+path.sep)||path.isAbsolute(relative))throw Error('Attachment path escapes storage root');
    const bytes=await fs.readFile(source),digest=sha(bytes);if(relative===row.path&&digest!==row.sha256)throw Error('Attachment integrity mismatch');const file=path.join(pending,'attachments',relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});assets.push({path:relative,bytes:bytes.length,sha256:digest});
  }}
  const dump=path.join(pending,'database.dump');const manifest={format:1,at:new Date().toISOString(),database:{file:'database.dump',bytes:(await fs.stat(dump)).size,sha256:await fileSha(dump)},tables,attachments:assets};
  await fs.writeFile(path.join(pending,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});await client.query('COMMIT');await fs.rename(pending,target);return{ok:true,directory:target,tableCount:Object.keys(tables).length,attachmentFiles:assets.length,dumpSha256:manifest.database.sha256};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();await pool.end();}
}
async function restoreCheck({url,bin,directory}){
 const u=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.pathname!=='/postgres')throw Error('Restore check requires an explicit isolated loopback /postgres cluster. Existing databases are never restored over.');
 const root=path.resolve(directory),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')),dump=path.join(root,'database.dump');if(await fileSha(dump)!==manifest.database.sha256)throw Error('Backup dump hash mismatch');
 for(const file of manifest.attachments){const source=path.resolve(root,'attachments',file.path);if(!source.startsWith(path.join(root,'attachments')+path.sep)||sha(await fs.readFile(source))!==file.sha256)throw Error('Backup attachment integrity mismatch');}
 const name='inv_restore_'+crypto.randomUUID().replaceAll('-',''),admin=new Pool({connectionString:url,max:1});let created=false,test;
 try{await admin.query('CREATE DATABASE '+name);created=true;u.pathname='/'+name;await command(tool(bin,'pg_restore'),['--no-owner','--no-privileges','--exit-on-error','--single-transaction','--dbname='+name,'database.dump'],pgEnvironment(u.href),root);test=new Pool({connectionString:u.href,max:1});const actual=await fingerprint(test);if(JSON.stringify(actual)!==JSON.stringify(manifest.tables))throw Error('Restored table fingerprint mismatch');return{ok:true,restoredIntoNewDatabase:true,tableCount:Object.keys(actual).length,attachmentFiles:manifest.attachments.length};}
 finally{if(test)await test.end();if(created)await admin.query('DROP DATABASE '+name);await admin.end();}
}
module.exports={backup,restoreCheck};
if(require.main===module){const [mode,...args]=process.argv.slice(2),options=Object.fromEntries(args.reduce((pairs,arg,i)=>i%2===0?[...pairs,[arg.replace(/^--/,''),args[i+1]]]:pairs,[]));const url=mode==='restore-check'?process.env.INVENTORY_RESTORE_TEST_URL:process.env.DATABASE_URL,bin=process.env.PG_BIN;(mode==='backup'?backup({url,bin,output:options.output,attachments:options.attachments}):mode==='restore-check'?restoreCheck({url,bin,directory:options.directory}):Promise.reject(Error('Choose backup or restore-check'))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});}
