const fs=require('node:fs'),path=require('node:path');
const {backup}=require('./backup.cjs');
async function main(){
 if(process.argv[2]!=='backup'||process.argv.length!==4||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(process.argv[3]))throw Error('Usage: backup <new-directory-name>');
 // Match init-db.sh command substitution; do not trim CR or spaces from the existing credential.
 const password=fs.readFileSync('/run/secrets/inventory_password','utf8').replace(/\n+$/,'');if(password.length<24)throw Error('Database secret too short');
 const url='postgresql://titan_inventory:'+encodeURIComponent(password)+'@db:5432/titan_inventory';
 console.log(JSON.stringify(await backup({url,bin:process.env.PG_BIN,attachments:'/data/attachments',output:path.join('/backups',process.argv[3])})));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
