import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canUnlockLocally} from '../src/login-policy';

test('fresh, expired and revoked accounts must authenticate online',()=>{
 for(const status of [null,{locked:true},{locked:true,localUnlockAvailable:false,previousUsername:'qa'}])
  assert.equal(canUnlockLocally(status,'qa'),false);
});
test('only the same account with a valid bounded local session can unlock offline',()=>{
 const status={locked:true,localUnlockAvailable:true,previousUsername:'QA'};
 assert.equal(canUnlockLocally(status,'qa'),true);
 assert.equal(canUnlockLocally(status,'another'),false);
 assert.equal(canUnlockLocally({...status,locked:false},'qa'),false);
 assert.equal(canUnlockLocally({...status,previousUsername:''},''),false);
});
