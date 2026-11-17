import test from 'node:test';
import assert from 'node:assert/strict';
import {syncSupervisorAttention} from '../src/modules/notifications/supervisor-attention.js';

test('supervisor reconciliation cannot run for a different role',async()=>{
  for(const role of ['admin','student','superadmin']) await syncSupervisorAttention({role},{query:()=>assert.fail('Unexpected supervisor query')});
});

test('supervisor alerts bind recipient, school and office, including an unassigned supervisor',async()=>{
  for(const office of [{id:'office-a'},null]){
    let calls=0;
    await syncSupervisorAttention({id:'supervisor-a',institutionId:'school-a',role:'supervisor',office},{async query(sql,params){
      calls++;
      assert.deepEqual(params,['supervisor-a','school-a',office?.id??null]);
      assert.match(sql,/s\.institution_id=\$2 AND s\.office_id=\$3/);
      assert.match(sql,/e\.institution_id=\$2 AND e\.owner_id=\$1/);
      assert.match(sql,/latest\.assigned_at DESC,latest\.id DESC/);
      assert.match(sql,/ON CONFLICT\(recipient_id,dedupe_key\) DO UPDATE/);
      return {rows:[]};
    }});
    assert.equal(calls,1);
  }
});
