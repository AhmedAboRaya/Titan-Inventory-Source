import type { OpenAPIObject } from '@nestjs/swagger';
/** Explicit endpoint contract for the common command router. */
export function inventoryOpenAPI(document:OpenAPIObject,base:string):OpenAPIObject{
 const paths:Record<string,any>={};
 const object={type:'object',additionalProperties:true},uuid={type:'string',format:'uuid'},version={type:'integer',minimum:1};
 const number={oneOf:[{type:'string',pattern:'^\\d+(\\.\\d{1,9})?$'},{type:'number',minimum:0}]};
 const schemas:Record<string,any>={
  Login:{type:'object',additionalProperties:false,required:['username','password'],properties:{username:{type:'string'},password:{type:'string',writeOnly:true},device:{type:'string',maxLength:120}}},
  Setup:{type:'object',additionalProperties:false,required:['username','display_name','password','setup_token'],properties:{username:{type:'string'},display_name:{type:'string'},password:{type:'string',minLength:12,writeOnly:true},setup_token:{type:'string',minLength:24,writeOnly:true}}},
  Version:{type:'object',additionalProperties:false,required:['version'],properties:{version}},
  Reverse:{type:'object',additionalProperties:false,required:['version','reason'],properties:{version,reason:{type:'string',minLength:1,maxLength:180}}},
  DocumentLine:{type:'object',additionalProperties:false,required:['item_id','quantity','unit'],properties:{item_id:uuid,quantity:number,unit:{type:'string'},location_id:uuid,destination_location_id:uuid,lot_id:uuid,serial_id:uuid,quality:{type:'string',enum:['Accepted','Under Inspection','Rejected','Blocked'],default:'Accepted'},condition:{type:'string',enum:['New','Used','Repair','Damaged'],default:'New'},destination_quality:{type:'string'},unit_cost:number,reference_line_id:uuid,purchase_line_id:uuid,notes:{type:'string',maxLength:1000}}},
  Document:{type:'object',additionalProperties:false,required:['type','document_date','warehouse_id','lines'],properties:{type:{type:'string',enum:['opening','receipt','production_receipt','issue','transfer','shipment','transfer_receipt','reserve','release','return','supplier_return','custody','custody_return','quality','scrap','adjustment_in','adjustment_out']},document_date:{type:'string',format:'date'},warehouse_id:uuid,destination_warehouse_id:uuid,department_id:uuid,recipient_id:uuid,machine_id:uuid,supplier_id:uuid,reference_id:uuid,reason:{type:'string'},notes:{type:'string'},currency:{type:'string',enum:['EGP','USD','EUR']},exchange_rate:number,version,metadata:{type:'object',additionalProperties:false,properties:{due_on:{type:'string',format:'date'},invoice:{type:'string'},production_order:{type:'string'}}},lines:{type:'array',minItems:1,maxItems:100,items:{$ref:'#/components/schemas/DocumentLine'}}}},
  Attachment:{type:'object',additionalProperties:false,required:['filename','mime','data'],properties:{item_id:uuid,document_id:uuid,warehouse_id:uuid,filename:{type:'string'},mime:{type:'string',enum:['image/jpeg','image/png','image/webp','application/pdf']},data:{type:'string',format:'byte',maxLength:2000000},primary_image:{type:'boolean',description:'Only item-only images can be primary; document/warehouse must be null.'}}},
  Error:{type:'object',properties:{error:{type:'object',properties:{code:{type:'string'},message:{type:'string'},fields:{type:'array',items:object}}}}}
 };
 function route(path:string,method:'get'|'post',summary:string,schema?:string,publicRoute=false,command=true){
  const parameters:any[]=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string'}}));
  if(method==='post'&&!publicRoute){parameters.push({name:'X-CSRF-Token',in:'header',required:true,schema:{type:'string'},description:'Returned by login/me. Origin must match the published HTTPS origin.'});if(command)parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:uuid,description:'Reuse the same UUID on retry with exactly the same body.'});}
  if(method==='get'&&!path.startsWith('auth/'))for(const name of ['warehouse_id','item_id','q','status','from','to','limit','offset','after'])parameters.push({name,in:'query',required:false,schema:{type:'string'},description:'Applicable filters are described by the endpoint; scopes are always enforced by the server.'});
  const op:any={summary,tags:[path.split('/')[0]],parameters,security:publicRoute?[]:[{cookie:[]}],responses:{200:{description:'Authorized result; cost fields omitted without cost.read',content:{'application/json':{schema:object}}}}};
  for(const code of [400,401,403,404,409,413,429,500])op.responses[code]={description:code===409?'Version, state, stock, or idempotency conflict; no partial posting':'Error; inspect error.code and Arabic message',content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}};
  if(method==='post')op.requestBody={required:true,content:{'application/json':{schema:schema?{$ref:'#/components/schemas/'+schema}:object}}};
  (paths[base+'/v1/'+path]||={})[method]=op;
 }
 route('auth/status','get','Whether first-administrator initialization is complete',undefined,true);
 route('auth/setup','post','First administrator only; server operator one-time code, no balances','Setup',true);
 route('auth/login','post','Start a 12-hour HttpOnly session','Login',true);
 route('auth/me','get','Current actor, permissions, scopes, CSRF, instance and fixed expiry');
 route('auth/logout','post','Revoke this session',undefined,false,false);
 for(const type of ['warehouses','locations','categories','items','masters','lots','serials','item-levels','users','roles']){route(type,'get','List '+type+' within current permissions');route(type,'post','Create '+type+' with validation');}
 for(const type of ['warehouses','locations','categories','items','masters','users'])route(type+'/{id}','post','Edit '+type+'; requires current version');
 route('items/{id}','get','Item details, authorized positions, cost, conversions and codes');
 for(const type of ['conversions','item-codes','settings'])route(type,'post','Approved '+type+' command');
 route('bootstrap','get','Current actor, instance, allowed warehouses and seeded category tree');
 route('documents','get','Recent documents within source, destination and department scopes');
 route('documents','post','Create an unposted draft; received quantities remain unofficial','Document');
 route('documents/{id}','get','Document and lines with authorized cost visibility');
 route('documents/{id}','post','Edit draft only with optimistic version','Document');
 for(const action of ['submit','approve','post','cancel','reject','reverse'])route('documents/{id}/'+action,'post',action==='post'?'Atomic locked ledger posting; approvals/scopes/available stock rechecked':'Document '+action,action==='reverse'?'Reverse':'Version');
 for(const kind of ['purchase-orders','counts','imports']){route(kind,'get','List '+kind);route(kind+'/{id}','get','Read '+kind+' detail');route(kind,'post','Create '+kind);for(const action of (kind==='imports'?['approve']:kind==='counts'?['lines','submit','approve','cancel']:['submit','approve','cancel']))route(kind+'/{id}/'+action,'post',kind+' '+action,action==='lines'||kind==='imports'?undefined:'Version');}
 route('attachments','post','Private attachment; normalized images or PDF, maximum 1.5MB','Attachment');route('attachments','get','Authorized item/document attachment metadata');route('attachments/{id}','get','Authorized base64 content; thumbnail=1 for image thumbnail');
 for(const path of ['reports/{kind}','exports/{kind}','dashboard','audit','changes','sessions'])route(path,'get',path.startsWith('exports')?'Scoped Excel report {filename,mime,data}; maximum 50,000 rows':path);
 route('sessions/{id}/revoke','post','Revoke only a session owned by the current user');
 for(const action of ['options','verify'])route('auth/passkey/'+action,'post','Passkey sign-in '+action,undefined,true,false);
 route('passkeys','get','Current user passkeys');for(const action of ['options','verify','revoke'])route('passkeys/'+action,'post','Authenticated passkey '+action,undefined,false,false);
 return{...document,paths,components:{...document.components,schemas:{...document.components?.schemas,...schemas},securitySchemes:{cookie:{type:'apiKey',in:'cookie',name:'titan_inventory'}}}};
}
