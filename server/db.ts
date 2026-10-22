import { Pool, types } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export interface SQL { query<T=any>(text: string, values?: any[]): Promise<{ rows: T[], rowCount?: number | null }> }
export interface Database extends SQL { transaction<T>(work: (db: SQL) => Promise<T>): Promise<T>; close(): Promise<void> }
// A document date is a calendar date, never a JS Date in the host timezone.
types.setTypeParser(1082, value=>value);
export class Postgres implements Database {
  private pool: Pool;
  constructor(url: string) { this.pool = new Pool({ connectionString: url, max: 8, statement_timeout: 15000, options:'-c timezone=Africa/Cairo', application_name: 'titan-inventory' }); }
  async query<T=any>(text:string, values:any[]=[]){ return this.pool.query(text, values) as unknown as Promise<{rows:T[],rowCount:number|null}>; }
  async transaction<T>(work:(db:SQL)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try { await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout = '10s'"); await client.query('SELECT pg_advisory_xact_lock(84610418)');
      const result=await work(client); await client.query('COMMIT'); return result;
    } catch(e){ await client.query('ROLLBACK'); throw e; } finally{ client.release(); }
  }
  async close(){ await this.pool.end(); }
}
export async function migrate(db:Database){
  await db.transaction(async tx=>{
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const seen=await tx.query('SELECT version FROM schema_migrations');
    const source=resolve(__dirname,'../migrations/001_inventory.sql');
    if(!seen.rows.some(r=>r.version===1)) await tx.query(readFileSync(existsSync(source)?source:resolve(__dirname,'../../migrations/001_inventory.sql'),'utf8'));
  });
}
export async function one<T=any>(db:SQL, text:string, values:any[]=[]):Promise<T|undefined>{return (await db.query<T>(text,values)).rows[0];}
