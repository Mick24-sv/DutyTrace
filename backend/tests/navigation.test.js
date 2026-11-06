import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_CONFIG, matchesSection } from '../../frontend/src/routes/navConfig.js';

test('secondary attendance pages stay in the attendance section', () => {
  const config = ROLE_CONFIG.student;
  const active = path => config.nav.filter(item => matchesSection(config,item,path)).map(item=>item.to);
  assert.deepEqual(active('/student/scan'), ['attendance']);
  assert.deepEqual(active('/student/discrepancies'), ['attendance']);
  assert.deepEqual(active('/student/dtr/123'), ['dtr']);
  assert.deepEqual(active('/student'), ['']);
  assert.deepEqual(active('/student/attendance-other'), []);
});

test('supervisor and administrator tools retain a single parent section', () => {
  for (const [role,path,parent] of [
    ['supervisor','/supervisor/assistants/123','assistants'],
    ['supervisor','/supervisor/office-qr','assistants'],
    ['admin','/admin/audit','settings'],
    ['admin','/admin/users/123','users'],
    ['admin','/admin/dtrs/123','reports'],
  ]) {
    const config = ROLE_CONFIG[role];
    assert.deepEqual(config.nav.filter(item=>matchesSection(config,item,path)).map(item=>item.to), [parent]);
  }
});
