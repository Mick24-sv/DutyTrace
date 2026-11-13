import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordChangeSchema,emailChangeSchema,emailConfirmSchema,changePassword,requestEmailChange,confirmEmailChange,accountSettings} from '../src/modules/platform/account.service.js';

test('account forms validate passwords and normalize new email without role overrides',()=>{
  assert.equal(passwordChangeSchema.safeParse({currentPassword:'current',newPassword:'short'}).success,false);
  assert.equal(passwordChangeSchema.safeParse({currentPassword:'current',newPassword:'a-long-password',userId:'someone-else'}).success,false);
  assert.equal(emailChangeSchema.parse({currentPassword:'current',newEmail:' USER@EXAMPLE.COM '}).newEmail,'user@example.com');
  assert.equal(emailConfirmSchema.safeParse({currentPassword:'current',token:'not-a-valid-token'}).success,false);
});
test('account mutations reject institution roles before database or email operations',async()=>{
  for(const role of ['admin','supervisor','student']) {
    const actor={role};
    await assert.rejects(()=>changePassword({actor,input:{}}),{status:403});
    await assert.rejects(()=>requestEmailChange({actor,input:{}}),{status:403});
    await assert.rejects(()=>confirmEmailChange({actor,input:{}}),{status:403});
    await assert.rejects(()=>accountSettings(actor),{status:403});
  }
});
test('email changes cannot bypass delivery verification when no provider is configured',async()=>{
  await assert.rejects(()=>requestEmailChange({actor:{role:'superadmin'},input:{currentPassword:'current',newEmail:'new@example.com'}},{configured:false}),{code:'EMAIL_NOT_CONFIGURED'});
});
