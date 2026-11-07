export function matchesCompletionGroup(student, group) {
  if (!group) return true;
  if (group === 'unassigned') return !student.requirementAssigned;
  if (group === 'completed') return student.requirementAssigned && student.remainingHours === 0;
  if (group === 'remaining') return student.requirementAssigned && student.remainingHours > 0;
  return false;
}
