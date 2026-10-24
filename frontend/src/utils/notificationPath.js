export function notificationPath(role, item) {
  if (typeof item.actionUrl === 'string' && item.actionUrl.startsWith('/') && !item.actionUrl.startsWith('//')) return item.actionUrl;
  const { relatedType, relatedId } = item;
  if (relatedType === 'monthly_dtr') {
    if (role === 'student') return `/student/dtr/${relatedId}`;
    if (role === 'supervisor') return `/supervisor/dtr-review/${relatedId}`;
    return `/admin/dtrs/${relatedId}`;
  }
  if (relatedType === 'absence_notice') return `/${role}/absences/${relatedId}`;
  if (relatedType === 'compliance_case') return `/${role}/cases/${relatedId}`;
  if (relatedType === 'academic_term') return role === 'admin' ? '/admin/semesters' : `/${role}`;
  if (relatedType === 'student') return role === 'admin' ? '/admin/users' : `/${role}/assistants/${relatedId}`;
  if (relatedType === 'duty_schedule') return '/student/schedule';
  if (relatedType === 'duty_recovery_plan') return role === 'student' ? '/student/schedule' : '/supervisor/recovery-review';
  if (relatedType === 'attendance_discrepancy') return `/${role}/discrepancies${relatedId ? `?discrepancyId=${encodeURIComponent(relatedId)}` : ''}`;
  return `/${role}`;
}

