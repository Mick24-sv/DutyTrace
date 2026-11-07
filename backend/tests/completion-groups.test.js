import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesCompletionGroup } from '../src/modules/reports/completion-groups.js';

test('completion groups use assigned requirements and verified remaining hours',()=>{
  const students=[
    {requirementAssigned:true,requiredHours:210,verifiedHours:210,remainingHours:0},
    {requirementAssigned:true,requiredHours:100,verifiedHours:146,remainingHours:0},
    {requirementAssigned:true,requiredHours:210,verifiedHours:146,remainingHours:64},
    {requirementAssigned:false,requiredHours:null,verifiedHours:146,remainingHours:null},
  ];
  assert.equal(students.filter(s=>matchesCompletionGroup(s,'completed')).length,2);
  assert.equal(students.filter(s=>matchesCompletionGroup(s,'remaining')).length,1);
  assert.equal(students.filter(s=>matchesCompletionGroup(s,'unassigned')).length,1);
  assert.equal(students.filter(s=>matchesCompletionGroup(s,undefined)).length,4);
  assert.equal(matchesCompletionGroup(students[0],'at_risk'),false);
});
