import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Postgres,migrate } from './db';import {seed}from './seed';import {Auth}from './auth';
async function main(){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
 // Password is supplied on stdin; never as a command-line argument or bundled asset.
 let hidden=false;const output=new Writable({write(chunk,_encoding,callback){if(!hidden)process.stdout.write(chunk);callback();}});
 Object.assign(output,{isTTY:process.stdout.isTTY});
 const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
 const username=await rl.question('First administrator username: ');
 const displayName=await rl.question('Display name: ');
 process.stdout.write('Password (12+ characters; hidden): ');hidden=true;const password=await rl.question('');hidden=false;process.stdout.write('\n');rl.close();
 const db=new Postgres(process.env.DATABASE_URL);try{await migrate(db);await seed(db);await new Auth(db).bootstrap(username,password,displayName);console.log('First administrator created. No stock balances added.');}finally{await db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
