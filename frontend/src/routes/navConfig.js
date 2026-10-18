import {
  LayoutDashboard, QrCode, Clock, CalendarDays, FileText, CalendarOff,
  FolderCheck, Users, ClipboardCheck, Building2, BarChart3, ScrollText,
  Settings, ShieldCheck, CalendarRange,
} from 'lucide-react';

// One source of truth for role-specific navigation.
// `to` is relative to the role's base path. `phase` says when a not-yet-built page is planned (omitted once built).
export const ROLE_CONFIG = {
  student: {
    label: 'Student Assistant',
    base: '/student',
    nav: [
      { to: '', label: 'Dashboard', icon: LayoutDashboard },
      { to: 'scan', label: 'Scan QR', icon: QrCode },
      { to: 'attendance', label: 'My Attendance', icon: Clock },
      { to: 'schedule', label: 'Schedule', icon: CalendarDays },
      { to: 'dtr', label: 'Monthly DTR', icon: FileText },
      { to: 'absences', label: 'Absence Notices', icon: CalendarOff },
      { to: 'cases', label: 'Compliance Cases', icon: FolderCheck },
    ],
  },
  supervisor: {
    label: 'Office Supervisor',
    base: '/supervisor',
    nav: [
      { to: '', label: 'Dashboard', icon: LayoutDashboard },
      { to: 'scan', label: 'Scan QR', icon: QrCode },
      { to: 'attendance', label: 'My Attendance', icon: Clock },
      { to: 'assistants', label: 'Student Assistants', icon: Users },
      { to: 'dtr-review', label: 'DTR Review', icon: ClipboardCheck },
      { to: 'absences', label: 'Absence Notices', icon: CalendarOff },
      { to: 'cases', label: 'Compliance Cases', icon: FolderCheck },
      { to: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  admin: {
    label: 'Administrator',
    base: '/admin',
    nav: [
      { to: '', label: 'Dashboard', icon: LayoutDashboard },
      { to: 'users', label: 'Users & Roles', icon: Users },
      { to: 'semesters', label: 'Academic Terms', icon: CalendarRange },
      { to: 'offices', label: 'Offices', icon: Building2 },
      { to: 'qr-codes', label: 'Office QR Codes', icon: QrCode },
      { to: 'dtrs', label: 'DTR Overview', icon: FileText },
      { to: 'cases', label: 'Compliance Cases', icon: FolderCheck },
      { to: 'reports', label: 'Reports', icon: BarChart3 },
      { to: 'audit', label: 'Audit Trail', icon: ScrollText, phase: 6 },
      { to: 'settings', label: 'Policy Settings', icon: Settings },
    ],
  },
};

export const BRAND_ICON = ShieldCheck;
