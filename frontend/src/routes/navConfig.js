import { MessageSquare, LayoutDashboard, Clock, FileText, CalendarOff, Users, ClipboardCheck, Building2, BarChart3, Settings, ShieldCheck, CalendarRange } from 'lucide-react';

// Everyday tasks only. Secondary tools belong inside their section.
export const ROLE_CONFIG = {
  student: { label: 'Student Assistant', base: '/student', nav: [
    { to: '', label: 'Home', icon: LayoutDashboard, related: ['profile','teammates'] },
    { to: 'attendance', label: 'Attendance', icon: Clock, related: ['scan', 'discrepancies'] },
    { to: 'dtr', label: 'Monthly DTR', icon: FileText },
    { to: 'absences', label: 'Absence Notices', icon: CalendarOff, related: ['cases'] },
    { to: 'concerns', label: 'Concerns', icon: MessageSquare },
  ] },
  supervisor: { label: 'Office Supervisor', base: '/supervisor', nav: [
    { to: '', label: 'Home', icon: LayoutDashboard, related: ['profile'] },
    { to: 'assistants', label: 'Student Assistants', icon: Users, related: ['discrepancies', 'office-qr', 'attendance', 'scan', 'historical-hours', 'reports', 'schedule-review'] },
    { to: 'dtr-review', label: 'DTR Review', icon: ClipboardCheck },
    { to: 'absences', label: 'Absence Notices', icon: CalendarOff, related: ['cases'] },
    { to: 'concerns', label: 'Concerns', icon: MessageSquare },
  ] },
  admin: { label: 'Administrator', base: '/admin', nav: [
    { to: '', label: 'Home', icon: LayoutDashboard },
    { to: 'users', label: 'Students & Staff', icon: Users },
    { to: 'offices', label: 'Offices', icon: Building2 },
    { to: 'semesters', label: 'Academic Terms', icon: CalendarRange },
    { to: 'reports', label: 'Reports', icon: BarChart3, related: ['dtrs'] },
    { to: 'concerns', label: 'Concerns', icon: MessageSquare },
    { to: 'settings', label: 'Settings', icon: Settings, related: ['qr-codes', 'audit', 'discrepancies', 'cases', 'absences', 'historical-hours'] },
  ] },
};
export function matchesSection(config, item, pathname) {
  if (!item.to) return pathname === config.base || (item.related??[]).some(path=>pathname===`${config.base}/${path}`);
  return [item.to, ...(item.related ?? [])].some(path => pathname === `${config.base}/${path}` || pathname.startsWith(`${config.base}/${path}/`));
}
export const BRAND_ICON = ShieldCheck;
