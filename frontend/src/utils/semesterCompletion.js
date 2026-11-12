const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export function semesterCompletion(summary, includeUnassigned = false) {
  const counts = { completed: count(summary.studentsMetRequirement), remaining: count(summary.studentsBelowRequirement), unassigned: count(summary.unassignedRequirements) };
  const assigned = counts.completed + counts.remaining;
  const total = assigned + (includeUnassigned ? counts.unassigned : 0);
  const groups = [
    { key: 'completed', label: 'Completed', description: 'Semester target achieved', tone: 'completed' },
    { key: 'remaining', label: 'Still completing', description: 'Working toward their target', tone: 'remaining' },
    { key: 'unassigned', label: 'No target assigned', description: 'Awaiting a semester requirement', tone: 'unassigned' },
  ].map(group => ({ ...group, count: counts[group.key], inChart: includeUnassigned || group.key !== 'unassigned', fraction: total && (includeUnassigned || group.key !== 'unassigned') ? counts[group.key] / total * 100 : 0 }));
  return { counts, groups, assigned, total, completionPercentage: assigned ? Math.round(counts.completed / assigned * 100) : 0 };
}
