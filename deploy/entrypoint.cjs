const fs=require('node:fs');
// Match init-db.sh command substitution: remove trailing LF only, preserving CR and spaces.
const password=fs.readFileSync(process.env.INVENTORY_PASSWORD_FILE||'/run/secrets/inventory_password','utf8').replace(/\n+$/,'');
if(password.length<24)throw Error('Inventory database secret must contain at least 24 characters.');
process.env.DATABASE_URL='postgresql://titan_inventory:'+encodeURIComponent(password)+'@db:5432/titan_inventory';
const setupFile=process.env.INVENTORY_SETUP_FILE||'/run/secrets/inventory_setup';
if(fs.existsSync(setupFile))process.env.INVENTORY_SETUP_HASH=require('node:crypto').createHash('sha256').update(fs.readFileSync(setupFile,'utf8').trim()).digest('hex');
const command=process.argv[2]||'serve';
if(!['serve','bootstrap'].includes(command))throw Error('Unsupported Inventory command');
require(command==='bootstrap'?'./dist/server/bootstrap.js':'./dist/server/main.js');
