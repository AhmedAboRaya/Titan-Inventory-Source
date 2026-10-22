export type LocalLoginStatus={locked?:boolean;localUnlockAvailable?:boolean;previousUsername?:string};
// A locked device is not evidence that this account has an authorized local session.
export function canUnlockLocally(status:LocalLoginStatus|null,username:string){
 return status?.locked===true&&status.localUnlockAvailable===true&&!!status.previousUsername&&status.previousUsername.toLowerCase()===username.toLowerCase();
}
