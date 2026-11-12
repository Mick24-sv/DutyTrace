import test from 'node:test';
import assert from 'node:assert/strict';
import { semesterCompletion } from '../src/utils/semesterCompletion.js';

test('admin chart excludes unassigned students but keeps their separate category', () => {
  const result = semesterCompletion({ studentsMetRequirement: 2, studentsBelowRequirement: 6, unassignedRequirements: 4 });
  assert.equal(result.total, 8);
  assert.equal(result.completionPercentage, 25);
  assert.equal(result.groups[0].fraction, 25);
  assert.equal(result.groups[2].inChart, false);
  assert.equal(result.groups[2].count, 4);
});
test('supervisor chart includes all assigned students without inflating the completion rate', () => {
  const result = semesterCompletion({ studentsMetRequirement: 2, studentsBelowRequirement: 6, unassignedRequirements: 2 }, true);
  assert.equal(result.total, 10);
  assert.equal(result.completionPercentage, 25);
  assert.deepEqual(result.groups.map(group => group.fraction), [20, 60, 20]);
});
test('empty and malformed counts do not produce invalid chart values', () => {
  const result = semesterCompletion({ studentsMetRequirement: -2, studentsBelowRequirement: undefined, unassignedRequirements: 'invalid' }, true);
  assert.equal(result.total, 0);
  assert.equal(result.completionPercentage, 0);
  assert.ok(result.groups.every(group => group.fraction === 0));
});
