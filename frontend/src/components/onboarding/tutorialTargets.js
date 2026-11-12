export const TUTORIAL_TARGETS = {
  admin: [
    { path: '/admin', selector: '.semester-overview-report', caption: 'View progress report', detail: 'This button opens the detailed semester report behind your dashboard summary.' },
    { path: '/admin/users', selector: '#u-name', caption: 'Create an account · Full name', detail: 'Start the account form here, then choose the person’s role and assigned office.' },
    { path: '/admin/semesters', selector: '#academic-year', caption: 'Academic year', detail: 'This form sets up or edits the academic term. Student requirements are managed farther down this page.' },
    { path: '/admin/dtrs', selector: '#status-filter', caption: 'DTR status filter', detail: 'Use this control to find monthly records by status. Administrators view these records; office supervisors approve them.' },
    { path: '/admin/concerns', selector: '[data-tutorial="new-concern"]', caption: 'New concern', detail: 'Use this button to start a conversation. Existing conversations and forwarded concerns appear below it.' },
    { path: '/admin', selector: '[data-tutorial="quick-start"]', caption: 'Quick start', detail: 'You can replay this guided tour from the Quick start button in the header.' },
  ],
  supervisor: [
    { path: '/supervisor', selector: '.semester-overview-report', caption: 'View progress report', detail: 'Open the report behind your office’s semester summary from this button.' },
    { path: '/supervisor', selector: '[data-tutorial="schedule-review"]', caption: 'Review preferences', detail: 'This button opens submitted duty schedules so you can review times and office coverage.' },
    { path: '/supervisor/office-qr', selector: '[data-tutorial="office-qr-display"]', caption: 'Your office QR code', detail: 'This is the office code students scan for attendance. Use Print QR code below it if you need a posted copy.', fallbackSelector: 'nav[aria-label="Attendance navigation"] a[href="/supervisor/office-qr"]', unavailable: 'An active QR code is not displayed yet. Ask your administrator to issue one; this Office QR link is where you return to find it.' },
    { path: '/supervisor/assistants', selector: '#assistant-search', caption: 'Find a Student Assistant', detail: 'Find a student here, then open their attendance to review sessions, corrections, and verification.', unavailable: 'Your assigned students will appear in this section once your office and its accounts are configured.' },
    { path: '/supervisor/dtr-review', selector: '#status-filter', caption: 'DTR review status filter', detail: 'Filter the review queue here, then open a submitted record to inspect its details.' },
    { path: '/supervisor', selector: '[data-tutorial="quick-start"]', caption: 'Quick start', detail: 'Return here any time to replay your office supervisor walkthrough.' },
  ],
  student: [
    { path: '/student', selector: '.student-semester-picker select', caption: 'Choose your academic term', detail: 'This control switches the semester shown in your progress card.', unavailable: 'Your academic-term selector appears here once an administrator sets up your semester.' },
    { path: '/student/profile', selector: 'input[autocomplete="name"]', caption: 'Your full name', detail: 'Review your personal details in this form. Your photo controls are just above it.' },
    { path: '/student', selector: '[data-tutorial="scan-qr"]', caption: 'Scan QR to time in or out', detail: 'This is the button you use when starting and ending duty. It opens your camera scanner when you choose it after the tour.' },
    { path: '/student/attendance', selector: '#attendance-month', caption: 'Attendance month', detail: 'Choose a month here, then expand a duty day below to inspect its sessions. Corrections is available in the navigation above.' },
    { path: '/student/dtr', selector: '[data-tutorial="dtr-action"]', caption: 'Your monthly DTR action', detail: 'This button opens a monthly preview or an existing record. Its label changes with your DTR’s current status.', unavailable: 'Monthly DTR actions appear here once a month has ended. You can continue the tour even if no monthly records are available yet.' },
    { path: '/student', selector: '[data-tutorial="quick-start"]', caption: 'Quick start', detail: 'Use this button whenever you want to go through the walkthrough again.' },
  ],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function placeTourCard(target, card, viewport) {
  const margin = 12;
  const gap = 16;
  const width = Math.min(card.width, viewport.width - margin * 2);
  const height = Math.min(card.height, viewport.height - margin * 2);
  const sideTop = clamp(target.top + target.height / 2 - height / 2, margin, viewport.height - height - margin);
  if (target.left + target.width + gap + width <= viewport.width - margin) return { left: target.left + target.width + gap, top: sideTop, maxHeight: viewport.height - margin * 2, side: 'right' };
  if (target.left - gap - width >= margin) return { left: target.left - gap - width, top: sideTop, maxHeight: viewport.height - margin * 2, side: 'left' };
  const below = viewport.height - target.top - target.height - gap - margin;
  const above = target.top - gap - margin;
  const left = clamp(target.left + target.width / 2 - width / 2, margin, viewport.width - width - margin);
  if (below >= height) return { left, top: target.top + target.height + gap, maxHeight: below, side: 'below' };
  if (above >= height) return { left, top: target.top - height - gap, maxHeight: above, side: 'above' };
  if (below >= above && below >= 140) return { left, top: target.top + target.height + gap, maxHeight: below, side: 'below' };
  if (above >= 140) return { left, top: margin, maxHeight: above, side: 'above' };
  return { left, top: viewport.height - height - margin, maxHeight: height, side: 'center' };
}
