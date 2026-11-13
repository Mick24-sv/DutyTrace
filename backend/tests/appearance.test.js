import {test} from 'node:test';import assert from 'node:assert/strict';
import {appearanceSchema,getAppearance,saveAppearance,DEFAULT_APPEARANCE} from '../src/modules/auth/appearance.service.js';
test('appearance requests accept only supported settings and no account override',()=>{
 assert.equal(appearanceSchema.safeParse({theme:'dark',accent:'blue',density:'compact'}).success,true);
 assert.equal(appearanceSchema.safeParse({...DEFAULT_APPEARANCE,userId:'other-user'}).success,false);
 assert.equal(appearanceSchema.safeParse({...DEFAULT_APPEARANCE,theme:'custom-css'}).success,false);
});
test('reads and writes always bind the authenticated user id',async()=>{
 const calls=[];const db={query:async(sql,values)=>{calls.push({sql,values});return {rows:[]};}};
 const result=await getAppearance({id:'signed-in-user'},db);assert.deepEqual(result.appearance,DEFAULT_APPEARANCE);assert.deepEqual(calls[0].values,['signed-in-user']);
 await saveAppearance({id:'signed-in-user'},{theme:'dark',accent:'rose',density:'compact'},db);
 assert.deepEqual(calls[1].values,['signed-in-user','dark','rose','compact']);
});
