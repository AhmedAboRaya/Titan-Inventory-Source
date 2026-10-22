import 'reflect-metadata';
import { All, Controller, Module, Req, Res, Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import express, {Request,Response} from 'express';
import { resolve } from 'node:path';
import { Inventory } from './service';
import { Problem, fail, z } from './common';
import { one } from './db';
import { Passkeys } from './passkeys';
import { inventoryOpenAPI } from './openapi';
export type HttpConfig={publicOrigin:string,bind?:string,basePath?:string,publicDir?:string,setupHash?:string};
function cookie(req:Request){const m=(req.headers.cookie||'').match(/(?:^|;\s*)titan_inventory=([^;]*)/);return m?decodeURIComponent(m[1]!):undefined;}
@Catch() class Errors implements ExceptionFilter{
 catch(error:any,host:ArgumentsHost){const response=host.switchToHttp().getResponse<Response>();
  if(error instanceof z.ZodError)return response.status(400).json({error:{code:'VALIDATION',message:'راجع الحقول المطلوبة',fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))}});
  if(error instanceof Problem)return response.status(error.status).json({error:{code:error.code,message:error.message}});
  if(error?.code==='23505')return response.status(409).json({error:{code:'DUPLICATE',message:'الكود أو السجل موجود بالفعل'}});
  if(error?.code==='23503')return response.status(400).json({error:{code:'REFERENCE',message:'مرجع غير صالح أو سجل مرتبط ببيانات أخرى'}});
  if(error?.code==='55P03'||error?.code==='40001')return response.status(409).json({error:{code:'BUSY',message:'عملية أخرى جارية؛ أعد المحاولة بنفس الطلب'}});
  console.error('inventory request failed',error?.name,error?.code||'INTERNAL');
  return response.status(500).json({error:{code:'INTERNAL',message:'تعذر إتمام الطلب؛ لم يتم تأكيد الترحيل'}});
 }
}
export async function createApp(service:Inventory,config:HttpConfig){
 const base=(config.basePath||'').replace(/\/$/,''),origin=new URL(config.publicOrigin);
 if(origin.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('HTTPS is required outside loopback');
 const cookieOptions={httpOnly:true,secure:origin.protocol==='https:',sameSite:'strict' as const,path:base+'/',maxAge:12*3600000};
 const passkeys=new Passkeys(service.db,service.auth,origin.origin);
 @Controller() class Api{
  @All('health') async health(@Res()res:Response){await service.db.query('SELECT 1');res.json({ok:true,app:'TITAN INVENTORY',version:'0.1.0'});}
  @All('v1/*path') async request(@Req()req:Request,@Res()res:Response){
   const path=(Array.isArray(req.params.path)?req.params.path.join('/'):req.params.path)||'',method=req.method;
   if(!['GET','POST'].includes(method))fail('METHOD','الطريقة غير مسموحة',405);
   if(method==='POST'&&req.headers.origin!==origin.origin)fail('ORIGIN','مصدر الطلب غير مسموح',403);
   if(path==='auth/status'&&method==='GET')return res.json({initialized:!!await one(service.db,'SELECT id FROM users LIMIT 1'),name:'TITAN INVENTORY'});
   if(path==='auth/setup'&&method==='POST')return res.json(await service.auth.setup(req.body,config.setupHash||process.env.INVENTORY_SETUP_HASH||''));
   if(path==='auth/login'&&method==='POST'){
    const result=await service.auth.login(req.body,req.ip||'unknown');res.cookie('titan_inventory',result.raw,cookieOptions);return res.json({actor:result.actor,csrf:result.csrf,instance:result.instance,expiresAt:result.expiresAt});
   }
   if(path==='auth/passkey/options'&&method==='POST')return res.json(await passkeys.options());
   if(path==='auth/passkey/verify'&&method==='POST'){const result=await passkeys.login(req.body);res.cookie('titan_inventory',result.raw,cookieOptions);return res.json({actor:result.actor,csrf:result.csrf,instance:result.instance,expiresAt:result.expiresAt});}
   const session=await service.auth.authenticate(cookie(req));
   if(method==='POST'&&req.headers['x-csrf-token']!==session.csrf)fail('CSRF','أعد فتح الجلسة',403);
   if(path==='auth/me'&&method==='GET')return res.json({actor:session.actor,csrf:session.csrf,instance:(await one(service.db,"SELECT value FROM settings WHERE key='instance'"))!.value,expiresAt:session.expiresAt});
   if(path==='auth/logout'&&method==='POST'){await service.db.query('UPDATE sessions SET revoked=true WHERE token_hash=$1',[session.session]);res.clearCookie('titan_inventory',cookieOptions);return res.json({ok:true});}
   if(path==='passkeys'&&method==='GET')return res.json(await passkeys.list(session.actor));
   if(path==='passkeys/options'&&method==='POST')return res.json(await passkeys.options(session.actor,session.session));
   if(path==='passkeys/verify'&&method==='POST')return res.json(await passkeys.register(session.actor,req.body,session.session));
   if(path==='passkeys/revoke'&&method==='POST')return res.json(await passkeys.revoke(session.actor,req.body,session.session));
   if(method==='GET'){const q:Record<string,string>={};for(const [k,v]of Object.entries(req.query))if(typeof v==='string')q[k]=v;return res.json(await service.read(session.actor,path,q));}
   const key=String(req.headers['idempotency-key']||'');return res.json(await service.mutate(session.actor,key,path,req.body,session.session));
  }
 }
 @Module({controllers:[Api]}) class AppModule{}
 const app=await NestFactory.create(AppModule,{logger:false,bodyParser:false});
 app.use(express.json({limit:'2mb',strict:true}));app.use((req:Request,res:Response,next:()=>void)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if(req.path.includes('/v1/'))res.setHeader('Cache-Control','no-store');next();
 });
 if(base)app.setGlobalPrefix(base.slice(1));app.useGlobalFilters(new Errors());
 const docs=new DocumentBuilder().setTitle('TITAN INVENTORY').setVersion('0.1.0').addCookieAuth('titan_inventory').build();
 SwaggerModule.setup(base+'/api-docs',app,inventoryOpenAPI(SwaggerModule.createDocument(app,docs),base));
 if(config.publicDir)app.use(base+'/',express.static(resolve(config.publicDir),{index:'index.html',dotfiles:'deny',fallthrough:true}));
 await app.init();return app;
}
