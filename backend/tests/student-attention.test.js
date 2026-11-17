import test from 'node:test';
import assert from 'node:assert/strict';
import {syncStudentAttention} from '../src/modules/notifications/student-attention.js';

test('student attention never runs for other roles',async()=>{
  for(const role of ['admin','supervisor','superadmin']) await syncStudentAttention({role},{query:()=>assert.fail('Unexpected student query')});
});

test('student alerts bind the student and school, use the latest reviewed preferences, and keep personal events private',async()=>{
  let calls=0;
  await syncStudentAttention({role:'student',id:'student-a',institutionId:'school-a'},{async query(sql,params){
    calls++;
    assert.deepEqual(params,['student-a','school-a']);
    assert.match(sql,/s\.institution_id=\$2 AND s\.student_id=\$1/);
    assert.match(sql,/e\.institution_id=\$2 AND e\.owner_id=\$1/);
    assert.match(sql,/ORDER BY latest\.version DESC LIMIT 1/);
    assert.match(sql,/s\.status IN \('approved','rejected','change_requested'\)/);
    assert.match(sql,/WHEN s\.status='approved' THEN 'informational'/);
    assert.match(sql,/ON CONFLICT\(recipient_id,dedupe_key\) DO UPDATE/);
    return {rows:[]};
  }});
  assert.equal(calls,1);
});
