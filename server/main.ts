import { Postgres,migrate } from './db';
import { seed } from './seed';
import { Inventory } from './service';
import { createApp } from './http';
async function main(){
 if(!process.env.DATABASE_URL||!process.env.PUBLIC_ORIGIN)throw Error('Set DATABASE_URL and PUBLIC_ORIGIN before starting Inventory');
 const db=new Postgres(process.env.DATABASE_URL);await migrate(db);await seed(db);
 const app=await createApp(new Inventory(db),{publicOrigin:process.env.PUBLIC_ORIGIN,basePath:process.env.BASE_PATH||'',publicDir:process.env.PUBLIC_DIR||'public'});
 await app.listen(Number(process.env.PORT||8080),process.env.BIND||'127.0.0.1');
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void app.close().then(()=>db.close()).then(()=>process.exit(0));});
 console.log('TITAN INVENTORY ready; no business balances seeded');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
