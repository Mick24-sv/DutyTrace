import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesVerification } from '../src/modules/attendance/session-verification.rules.js';

const session={id:'session-1',counted:true,seconds:3600,timeIn:'2026-11-05T01:00:00.000Z',timeOut:'2026-11-05T02:00:00.000Z'};
const verification={session_id:session.id,seconds:3600,time_in:new Date(session.timeIn),time_out:new Date(session.timeOut)};
test('verification applies only to the exact completed session reviewed',()=>{
  assert.equal(matchesVerification(session,verification),true);
  assert.equal(matchesVerification({...session,counted:false},verification),false);
  assert.equal(matchesVerification({...session,id:'replacement'},verification),false);
  assert.equal(matchesVerification({...session,timeOut:'2026-11-05T03:00:00.000Z'},verification),false);
  assert.equal(matchesVerification({...session,seconds:7200},verification),false);
});
