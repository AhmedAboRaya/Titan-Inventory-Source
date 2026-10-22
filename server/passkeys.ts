import{generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}from '@simplewebauthn/server';
import{Database,SQL,one}from './db';import{Auth}from './auth';import{Actor,fail,z,uuid,token,hash}from './common';
export class Passkeys{
 constructor(readonly db:Database,readonly auth:Auth,readonly origin:string){}
 private get rp(){return new URL(this.origin).hostname;}
 private async session(tx:SQL,a:Actor,sessionHash?:string){await this.auth.actor(tx,a.id);if(!sessionHash||!await one(tx,'SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND NOT revoked AND expires_at>now()',[sessionHash,a.id]))fail('SESSION','انتهت صلاحية الجلسة؛ سجل الدخول مجددًا',401);}
 async options(actor?:Actor,sessionHash?:string){
  const options=actor?await generateRegistrationOptions({rpName:'TITAN INVENTORY',rpID:this.rp,userID:new TextEncoder().encode(actor.id),userName:actor.username,userDisplayName:actor.display_name,attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:(await this.db.query('SELECT id,transports FROM passkeys WHERE user_id=$1',[actor.id])).rows}):await generateAuthenticationOptions({rpID:this.rp,userVerification:'required'});
  const row=await this.db.transaction(async tx=>{
   if(actor)await this.session(tx,actor,sessionHash);
   await tx.query('DELETE FROM challenges WHERE expires_at<now()');
   if(actor)await tx.query('DELETE FROM challenges WHERE user_id=$1 AND kind=\'register\'',[actor.id]);
   const count=await one(tx,'SELECT count(*)::int n FROM challenges');if(count!.n>500)fail('BUSY','حاول بعد قليل',429);
   return(await tx.query("INSERT INTO challenges(user_id,kind,challenge,expires_at) VALUES($1,$2,$3,now()+interval '3 minutes') RETURNING id",[actor?.id||null,actor?'register':'login',options.challenge])).rows[0];
  });return{challenge_id:row.id,options};
 }
 async register(a:Actor,body:any,sessionHash?:string){
  const id=uuid.parse(body.challenge_id);return this.db.transaction(async tx=>{
   await this.session(tx,a,sessionHash);const challenge=await one(tx,"DELETE FROM challenges WHERE id=$1 AND user_id=$2 AND kind='register' AND expires_at>now() RETURNING *",[id,a.id]);if(!challenge)fail('CHALLENGE','انتهى طلب تسجيل مفتاح المرور',400);
   let result;try{result=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:this.origin,expectedRPID:this.rp,requireUserVerification:true});}catch{fail('PASSKEY','تعذر التحقق من مفتاح المرور',400);}
   if(!result.verified)fail('PASSKEY','تعذر تسجيل مفتاح المرور');const c=result.registrationInfo.credential;
   await tx.query('INSERT INTO passkeys(id,user_id,public_key,counter,transports) VALUES($1,$2,$3,$4,$5)',[c.id,a.id,Buffer.from(c.publicKey),c.counter,c.transports||[]]);
   await tx.query("INSERT INTO audit(user_id,action,target) VALUES($1,'passkey.register',$2)",[a.id,c.id]);return{ok:true};
  });
 }
 async login(body:any){
  const id=uuid.parse(body.challenge_id);return this.db.transaction(async tx=>{
   const challenge=await one(tx,"DELETE FROM challenges WHERE id=$1 AND kind='login' AND expires_at>now() RETURNING *",[id]);if(!challenge)fail('CHALLENGE','انتهى طلب الدخول؛ حاول مرة أخرى',400);
   const credential=await one(tx,'SELECT * FROM passkeys WHERE id=$1',[z.string().max(1500).parse(body.response?.id)]);if(!credential)fail('PASSKEY','مفتاح المرور غير مسجل',401);
   const actor=await this.auth.actor(tx,credential.user_id);let result;
   try{result=await verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:this.origin,expectedRPID:this.rp,credential:{id:credential.id,publicKey:new Uint8Array(credential.public_key),counter:Number(credential.counter),transports:credential.transports},requireUserVerification:true});}catch{fail('PASSKEY','تعذر التحقق من مفتاح المرور',401);}
   if(!result.verified)fail('PASSKEY','تعذر الدخول',401);
   await tx.query('UPDATE passkeys SET counter=$2 WHERE id=$1',[credential.id,result.authenticationInfo.newCounter]);
   const raw=token(),csrf=token();const session=await one(tx,"INSERT INTO sessions(token_hash,user_id,csrf,device,expires_at) VALUES($1,$2,$3,'Passkey',now()+interval '12 hours') RETURNING expires_at",[hash(raw),actor.id,csrf]);
   await tx.query("INSERT INTO audit(user_id,action,target) VALUES($1,'passkey.login',$2)",[actor.id,actor.id]);
   return{raw,csrf,actor,expiresAt:new Date(session!.expires_at).toISOString(),instance:(await one(tx,"SELECT value FROM settings WHERE key='instance'"))!.value};
  });
 }
 async list(a:Actor){return(await this.db.query('SELECT id,transports FROM passkeys WHERE user_id=$1',[a.id])).rows;}
 async revoke(a:Actor,body:any,sessionHash?:string){const id=z.string().max(1500).parse(body.id);await this.db.transaction(async tx=>{await this.session(tx,a,sessionHash);await tx.query('DELETE FROM passkeys WHERE id=$1 AND user_id=$2',[id,a.id]);await tx.query('UPDATE sessions SET revoked=true WHERE user_id=$1',[a.id]);await tx.query("INSERT INTO audit(user_id,action,target) VALUES($1,'passkey.revoke',$2)",[a.id,id]);});return{ok:true};}
}
