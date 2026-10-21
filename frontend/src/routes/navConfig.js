import {
  LayoutDashboard, QrCode, Clock, CalendarDays, FileText, CalendarOff,
  FolderCheck, Users, ClipboardCheck, Building2, BarChart3, ScrollText,
  Settings, ShieldCheck, CalendarRange, ClipboardList,
} from 'lucide-react';

// One source of truth for role-specific navigation.
// `to` is relative to the role's base path. `phase` says when a not-yet-built page is planned (omitted once built).
export const ROLE_CONFIG = {
  student: {
    label: 'Student Assistant',
    base: '/student',
    nav: [
      { section: 'WORKSPACE', to: '', label: 'Dashboard', icon: LayoutDashboard },
      { section: 'DUTY & ATTENDANCE', to: 'scan', label: 'Scan QR', icon: QrCode },
      { section: 'DUTY & ATTENDANCE', to: 'attendance', label: 'My Attendance', icon: Clock },
      { section: 'DUTY & ATTENDANCE', to: 'schedule', label: 'My Duty Preferences', icon: CalendarDays },
      { section: 'DUTY & ATTENDANCE', to: 'dtr', label: 'Monthly DTR', icon: FileText },
      { section: 'ABSENCES & COMPLIANCE', to: 'absences', label: 'Absence Notices', icon: CalendarOff },
      { section: 'ABSENCES & COMPLIANCE', to: 'cases', label: 'Compliance Cases', icon: FolderCheck },
    ],
  },
  supervisor: {
    label: 'Office Supervisor',
    base: '/supervisor',
    nav: [
      { section: 'WORKSPACE', to: '', label: 'Dashboard', icon: LayoutDashboard },
      { section: 'DUTY OPERATIONS', to: 'office-qr', label: 'Office QR Code', icon: QrCode },
      { section: 'DUTY OPERATIONS', to: 'attendance', label: 'My Attendance', icon: Clock },
      { section: 'DUTY OPERATIONS', to: 'assistants', label: 'Student Assistants', icon: Users },
      { section: 'DUTY OPERATIONS', to: 'dtr-review', label: 'DTR Review', icon: ClipboardCheck },
      { section: 'DUTY OPERATIONS', to: 'schedule-review', label: 'Duty Schedule Review', icon: ClipboardList },
      { section: 'DUTY OPERATIONS', to: 'recovery-review', label: 'Recovery Shift Review', icon: CalendarDays },
      { section: 'ABSENCES & COMPLIANCE', to: 'absences', label: 'Absence Notices', icon: CalendarOff },
      { section: 'ABSENCES & COMPLIANCE', to: 'cases', label: 'Compliance Cases', icon: FolderCheck },
      { section: 'REPORTING', to: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  admin: {
    label: 'Administrator',
    base: '/admin',
    nav: [
      { section: 'WORKSPACE', to: '', label: 'Dashboard', icon: LayoutDashboard },
      { section: 'DUTY OPERATIONS', to: 'users', label: 'Users & Roles', icon: Users },
      { section: 'DUTY OPERATIONS', to: 'semesters', label: 'Academic Terms', icon: CalendarRange },
      { section: 'DUTY OPERATIONS', to: 'semester-transitions', label: 'Semester Transitions', icon: CalendarRange },
      { section: 'DUTY OPERATIONS', to: 'offices', label: 'Offices', icon: Building2 },
      { section: 'DUTY OPERATIONS', to: 'qr-codes', label: 'Office QR Codes', icon: QrCode },
      { section: 'MONITORING & COMPLIANCE', to: 'dtrs', label: 'DTR Overview', icon: FileText },
      { section: 'MONITORING & COMPLIANCE', to: 'duty-requirements', label: 'Duty Requirements', icon: ClipboardList },
      { section: 'MONITORING & COMPLIANCE', to: 'cases', label: 'Compliance Cases', icon: FolderCheck },
      { section: 'ADMINISTRATION', to: 'reports', label: 'Reports', icon: BarChart3 },
      { section: 'ADMINISTRATION', to: 'audit', label: 'Audit Trail', icon: ScrollText },
      { section: 'ADMINISTRATION', to: 'settings', label: 'Policy Settings', icon: Settings },
    ],
  },
};

export const BRAND_ICON = ShieldCheck;
