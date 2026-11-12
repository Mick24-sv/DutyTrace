export function filterSchedules(schedules, search, status) {
  const term = search.trim().toLowerCase();
  return schedules.filter(schedule => (!status || schedule.status === status) && (schedule.studentName ?? '').toLowerCase().includes(term));
}

export function dutyProgress(student) {
  const required = Number(student.semesterRequiredHours);
  const verified = Math.max(0, Number(student.semesterVerifiedHours) || 0);
  const assigned = Boolean(student.semesterRequirementAssigned) && Number.isFinite(required) && required > 0;
  return { assigned, required: assigned ? required : null, verified, percentage: assigned ? Math.min(100, Math.round(verified / required * 100)) : null };
}

export function monthlyVerification(student, month) {
  const verified = Number(student.monthlyVerifiedHours?.[month]) || 0;
  const recorded = Number(student.monthlyHours?.[month]) || 0;
  return { verified, recorded, historical: Number(student.historicalMonthlyHours?.[month]) || 0,
    pending: student.monthlyDtrStatuses?.[month] !== 'approved' && verified <= 0 && recorded > 0 };
}

export function dutyFollowUp(student) {
  const progress = dutyProgress(student);
  const tone = { overdue: 'overdue', at_risk: 'attention', on_track: 'on-track', completed: 'on-track' }[student.semesterStatus] ?? 'neutral';
  const remaining = progress.assigned
    ? student.semesterRemainingHours == null ? Math.max(0, progress.required - progress.verified) : Math.max(0, Number(student.semesterRemainingHours) || 0)
    : null;
  return { ...progress, tone, remaining };
}
