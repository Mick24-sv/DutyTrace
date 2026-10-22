import test from 'node:test';
import assert from 'node:assert/strict';
import { canMoveDiscrepancy, isWithinShiftTolerance, sessionsOverlap } from '../src/modules/attendance-discrepancies/discrepancy.rules.js';

test('discrepancy workflow allows only intended state transitions',()=>{
  assert.equal(canMoveDiscrepancy('open','explanation_submitted'),true);
  assert.equal(canMoveDiscrepancy('explanation_submitted','under_review'),true);
  assert.equal(canMoveDiscrepancy('under_review','approved_correction'),true);
  assert.equal(canMoveDiscrepancy('under_review','open'),true);
  assert.equal(canMoveDiscrepancy('open','approved_correction'),false);
  assert.equal(canMoveDiscrepancy('rejected','under_review'),false);
});

test('shift tolerance accepts only configured early and late windows',()=>{
  const start='2026-10-20T01:00:00.000Z',end='2026-10-20T05:00:00.000Z';
  assert.equal(isWithinShiftTolerance('2026-10-20T00:45:00.000Z',[{startsAt:start,endsAt:end}],{earlyMinutes:15,lateMinutes:10}),true);
  assert.equal(isWithinShiftTolerance('2026-10-20T05:11:00.000Z',[{startsAt:start,endsAt:end}],{earlyMinutes:15,lateMinutes:10}),false);
});

test('overlap boundaries allow back-to-back shifts but reject concurrent sessions',()=>{
  assert.equal(sessionsOverlap({start:'2026-10-20T01:00:00Z',end:'2026-10-20T05:00:00Z'},{start:'2026-10-20T05:00:00Z',end:'2026-10-20T07:00:00Z'}),false);
  assert.equal(sessionsOverlap({start:'2026-10-20T01:00:00Z',end:'2026-10-20T05:00:00Z'},{start:'2026-10-20T04:59:00Z',end:'2026-10-20T07:00:00Z'}),true);
});
