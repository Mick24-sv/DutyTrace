import test from 'node:test';
import assert from 'node:assert/strict';
import { loginDestination } from '../src/utils/loginDestination.js';

test('successful login returns each role to its dashboard by default', () => {
  for (const role of ['admin', 'supervisor', 'student']) assert.equal(loginDestination(role), `/${role}`);
});
test('the transition preserves the intended page within the signed-in role', () => {
  assert.equal(loginDestination('admin', '/admin/concerns?id=123'), '/admin/concerns?id=123');
  assert.equal(loginDestination('student', '/student?view=recent'), '/student?view=recent');
  assert.equal(loginDestination('supervisor', '/supervisor#schedule'), '/supervisor#schedule');
});
test('cross-role, external and prefix lookalike destinations cannot be used', () => {
  for (const from of ['/student/attendance', '/administrator', '/admin-evil', '//example.com/admin', 'https://example.com', null, {}]) {
    assert.equal(loginDestination('admin', from), '/admin');
  }
});
