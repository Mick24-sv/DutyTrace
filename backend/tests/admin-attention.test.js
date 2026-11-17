import test from 'node:test';
import assert from 'node:assert/strict';
import {syncAdminAttention} from '../src/modules/notifications/admin-attention.js';

test('admin attention reconciliation never queries for other roles', async () => {
  for (const role of ['student','supervisor','superadmin']) {
    await syncAdminAttention({role}, {query:()=>assert.fail('Non-admin must not access the admin reminder queue')});
  }
});

test('reconciliation binds the current institution and recipient in one atomic statement', async () => {
  let calls=0;
  await syncAdminAttention({role:'admin',id:'admin-id',institutionId:'school-id'}, {
    async query(sql,params){
      calls++;
      assert.deepEqual(params,['admin-id','school-id']);
      // Personal events stay private even between administrators in one school.
      assert.match(sql,/e\.institution_id=\$2 AND e\.owner_id=\$1/);
      assert.match(sql,/c\.institution_id=\$2 AND c\.status='pending_admin'/);
      assert.match(sql,/ON CONFLICT\(recipient_id,dedupe_key\) DO UPDATE/);
      assert.match(sql,/UPDATE notifications n SET resolved_at/);
      return {rows:[]};
    },
  });
  assert.equal(calls,1);
});
