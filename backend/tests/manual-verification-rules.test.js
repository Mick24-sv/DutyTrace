import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifiedSecondsForTerm} from '../src/modules/semesters/semester.rules.js';

test('a supervisor monthly decision replaces the verified amount, without adding it to QR hours',()=>{
  const dtr={status:'approved',snapshot:{days:[{sessions:[{counted:true,timeIn:'2026-10-10T08:00:00Z',seconds:7200}]}],
    supervisorVerification:{seconds:54*3600,deltaSeconds:52*3600,effectiveDate:'2026-10-10'}}};
  assert.equal(verifiedSecondsForTerm([dtr],'2026-07-01','2026-12-31','Asia/Manila'),54*3600);
  assert.equal(verifiedSecondsForTerm([dtr],'2026-10-11','2026-12-31','Asia/Manila'),0);
  assert.equal(verifiedSecondsForTerm([{...dtr,status:'under_review'}],'2026-07-01','2026-12-31','Asia/Manila'),0);
});
test('zero-hour supervisor decisions and ordinary DTR sessions remain distinct',()=>{
  const ordinary={status:'approved',snapshot:{days:[{sessions:[{counted:true,timeIn:'2026-10-10T08:00:00Z',seconds:7200}]}]}};
  assert.equal(verifiedSecondsForTerm([ordinary],'2026-07-01','2026-12-31','Asia/Manila'),7200);
  ordinary.snapshot.supervisorVerification={seconds:0,effectiveDate:'2026-10-10'};
  assert.equal(verifiedSecondsForTerm([ordinary],'2026-07-01','2026-12-31','Asia/Manila'),0);
});

test('whole-month verification credits its covering term once without inventing a duty date',()=>{
  const dtr={status:'approved',snapshot:{days:[],supervisorVerification:{seconds:54*3600,creditScope:'month',periodStart:'2026-10-01',periodEnd:'2026-10-31',effectiveDate:null}}};
  assert.equal(verifiedSecondsForTerm([dtr],'2026-07-01','2026-12-31','Asia/Manila'),54*3600);
  assert.equal(verifiedSecondsForTerm([dtr],'2026-10-01','2026-10-31','Asia/Manila'),54*3600);
  assert.equal(verifiedSecondsForTerm([dtr],'2026-10-15','2026-12-31','Asia/Manila'),0);
  assert.equal(verifiedSecondsForTerm([dtr],'2026-11-01','2026-12-31','Asia/Manila'),0);
});
