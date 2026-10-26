export type Actor={id:string;username:string;display_name:string;permissions:string[];warehouse_ids:string[];department_ids:string[];all_warehouses:boolean;all_departments:boolean;version:number;role_id:string};
export type Session={actor:Actor;instance:any;csrf:string;expiresAt:string;nativeScope?:string};
declare global {interface Window {TitanInventory?:{request:(s:string)=>void};TitanHost?:{openModule?:(id:string)=>void};}}
export class ApiError extends Error{constructor(public status:number,public code:string,message:string){super(message)}}
export const native=!!window.TitanInventory;
export const uid=()=>crypto.randomUUID();
let session:Session|null=null;
export function setSession(value:Session|null){session=value}
export function getSession(){return session}
export function instanceId(s:Session){return typeof s.instance==='string'?s.instance:JSON.stringify(s.instance)}
export function scopeId(s:Session){return [instanceId(s),s.actor.id,s.actor.version,[...s.actor.permissions].sort().join(','),s.actor.all_warehouses?'all':s.actor.warehouse_ids.join(','),s.actor.all_departments?'all':s.actor.department_ids.join(',')].join('|')}
const pending=new Map<string,{resolve:(b:any)=>void,reject:(e:any)=>void,timer:number}>();
window.addEventListener('titan:inventory-response',((e:CustomEvent)=>{const d=e.detail,p=pending.get(d?.id);if(!p)return;pending.delete(d.id);clearTimeout(p.timer);if(d.status>=200&&d.status<300)p.resolve(d.body);else p.reject(problem(d.status,d.body))}) as EventListener);
function problem(status:number,body:any){return new ApiError(status,body?.error?.code||'NETWORK',(body?.error?.message||'تعذر الاتصال بالخادم / Server unavailable')+(Array.isArray(body?.error?.fields)?' · '+body.error.fields.map((f:any)=>f.path+': '+f.message).join(' · '):''))}
export function nativeRequest(data:any):Promise<any>{return new Promise((resolve,reject)=>{const id=uid();const timer=window.setTimeout(()=>{pending.delete(id);reject(new ApiError(0,'NETWORK','انتهت مهلة الاتصال؛ الطلب محفوظ للمراجعة / Request timed out'))},data.action?.toLowerCase().includes('biometric')?95000:45000);pending.set(id,{resolve,reject,timer});try{window.TitanInventory!.request(JSON.stringify({...data,id}))}catch(e){clearTimeout(timer);pending.delete(id);reject(e)}})}
function safeUrlPath(path:string):string{const[pathname,search]=path.split('?');const safePathname=pathname.split('/').map(seg=>{try{return encodeURIComponent(decodeURIComponent(seg))}catch{return encodeURIComponent(seg)}}).join('/');return safePathname+(search!==undefined?'?'+search:'');}
export async function request(path:string,body?:any,key?:string):Promise<any>{
 const s=session,method=body===undefined?'GET':'POST';let result:any;const safePath=safeUrlPath(path);
 if(native)result=await nativeRequest({method,path:'/v1/'+safePath,body,idempotencyKey:key,accountId:s?.actor.id,scope:s?.nativeScope});
 else{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
  try{const response=await fetch(import.meta.env.BASE_URL+'v1/'+safePath,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':s?.csrf||'',...(key?{'Idempotency-Key':key}:{})})},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal});const data=await response.json().catch(()=>({}));if(!response.ok)throw problem(response.status,data);result=data;}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(0,'NETWORK','الاتصال غير متاح؛ لم يتأكد تنفيذ الطلب / Connection unavailable')}finally{clearTimeout(timer)}
 }
 if(s&&session!==s)throw new ApiError(401,'SESSION_CHANGED','تغير الحساب؛ أُهملت استجابة الجلسة السابقة');return result;
}
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise((resolve,reject)=>{const r=indexedDB.open('titan.inventory.private.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('scopes');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function readPrivate(key:string,s=getSession()):Promise<any>{if(!s)return null;if(native){const d=await nativeRequest({action:'cacheGet',accountId:s.actor.id,scope:s.nativeScope,key});return d.value?JSON.parse(d.value):null}const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('scopes').objectStore('scopes').get(scopeId(s)+'::'+key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}
export async function writePrivate(key:string,value:any,s=getSession()){if(!s)throw new Error('Session required');if(native){await nativeRequest({action:'cacheSet',accountId:s.actor.id,scope:s.nativeScope,key,value:JSON.stringify(value)});return}const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction('scopes','readwrite');tx.objectStore('scopes').put(value,scopeId(s)+'::'+key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
export type Operation={id:string,path:string,body:any,at:string,state:'pending'|'rejected',error?:string};
let tail=Promise.resolve();
async function serial<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work,work);tail=next.then(()=>{},()=>{});return next}
export async function operations(){return(await readPrivate('outbox')||[]) as Operation[]}
export async function mutate(path:string,body:any,key?:string){
 const s=session;if(!s)throw new ApiError(401,'SESSION','سجّل الدخول');
 if(!key)key=(await operations()).find(o=>o.state==='pending'&&o.path===path&&JSON.stringify(o.body)===JSON.stringify(body))?.id||uid();
 await serial(async()=>{const rows=await operations();const old=rows.find(x=>x.id===key);if(old&&(old.path!==path||JSON.stringify(old.body)!==JSON.stringify(body)))throw new Error('Immutable operation changed');if(!old){if(rows.length>=200)throw new Error('راجع الطلبات المحفوظة قبل إضافة طلب جديد');rows.push({id:key,path,body,at:new Date().toISOString(),state:'pending'});await writePrivate('outbox',rows,s)}});
 try{const result=await request(path,body,key);await serial(async()=>{const rows=await readPrivate('outbox',s)||[];await writePrivate('outbox',rows.filter((x:Operation)=>x.id!==key),s)});return result}
 catch(e){if(e instanceof ApiError&&e.status>=400&&e.status<500&&![408,429].includes(e.status)){await serial(async()=>{const rows=await readPrivate('outbox',s)||[];const row=rows.find((x:Operation)=>x.id===key);if(row){row.state='rejected';row.error=e.message;await writePrivate('outbox',rows,s)}})}throw e}
}
export async function syncDrafts(){const rows=await operations();for(const row of rows){if(row.state==='pending'&&/^documents(?:\/[a-f0-9-]{36})?$/.test(row.path)){try{await mutate(row.path,row.body,row.id)}catch{break}}}}
export function download(name:string,content:BlobPart,type='application/json'){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
