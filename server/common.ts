import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import Decimal from 'decimal.js';
import { z } from 'zod';
Decimal.set({precision:40, rounding:Decimal.ROUND_HALF_UP});
export { Decimal, z, randomUUID };
export class Problem extends Error { constructor(public status:number, public code:string, message:string){super(message);} }
export function fail(code:string,message:string,status=400):never{throw new Problem(status,code,message);}
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const uuid=z.string().uuid();
export const text=z.string().trim().min(1).max(180);
export const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(new Date(s).getTime())&&new Date(s).toISOString().slice(0,10)===s,'Invalid date');
export const decimal=z.union([z.string(),z.number()]).transform(String).refine(s=>/^\d{1,15}(\.\d{1,9})?$/.test(s),'Use a non-negative decimal');
export const qty=decimal.refine(s=>new Decimal(s).gt(0),'Quantity must be positive');
export const nullableId=uuid.nullable().optional();
export const json=(value:any)=>JSON.stringify(value);
export const cairoDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const scrypt=promisify(scryptCallback);
export async function passwordHash(password:string){
  if(password.length<12||password.length>256)fail('PASSWORD','كلمة المرور من 12 إلى 256 حرفًا');
  const salt=randomBytes(16).toString('hex'); const key=await scrypt(password,salt,64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password:string, encoded:string){
  if(password.length>256)return false;
  const [algorithm,salt,expected]=encoded.split(':'); if(algorithm!=='scrypt'||!salt||!expected)return false;
  const key=await scrypt(password,salt,64) as Buffer; const old=Buffer.from(expected,'hex');
  return old.length===key.length&&timingSafeEqual(old,key);
}
export const PERMISSIONS=['catalog.read','catalog.write','stock.read','receipt','issue','transfer','reserve','custody','quality','count','purchase','approve','reverse','cost.read','reports','users','settings','import'] as const;
export type Actor={id:string,username:string,display_name:string,role_id:string,permissions:string[],warehouse_ids:string[],department_ids:string[],all_warehouses:boolean,all_departments:boolean,version:number};
export function permit(a:Actor,p:string){ if(!a.permissions.includes(p))fail('FORBIDDEN','ليس لديك صلاحية لهذا الإجراء',403); }
export function warehouse(a:Actor,id:string){if(!a.all_warehouses&&!a.warehouse_ids.includes(id))fail('SCOPE','المخزن خارج نطاق صلاحياتك',403);}
export function department(a:Actor,id?:string|null){if(id&&!a.all_departments&&!a.department_ids.includes(id))fail('SCOPE','القسم خارج نطاق صلاحياتك',403);}
const costKeys=new Set(['unit_cost','posted_unit_cost','average_cost','last_price','value','unit_price','cost','total_cost','exchange_rate','pricing_coverage','unpriced_quantity','posted_value','posted_unpriced_quantity']);
export function visible(value:any,a:Actor):any{
  if(a.permissions.includes('cost.read'))return value;
  if(Array.isArray(value))return value.map(v=>visible(v,a));
  if(value&&typeof value==='object'&&!(value instanceof Date)){const result:any={}; for(const [key,v]of Object.entries(value))if(!costKeys.has(key))result[key]=visible(v,a); return result;}
  return value;
}
export async function resolveItemId(db:{query:<T=any>(text:string,values?:any[])=>Promise<{rows:T[]}>},idOrSku?:string|null):Promise<string|null>{
  if(!idOrSku)return null;
  if(uuid.safeParse(idOrSku).success)return idOrSku;
  const row=(await db.query('SELECT id FROM items WHERE sku=$1',[idOrSku])).rows[0];
  return row?.id||null;
}
