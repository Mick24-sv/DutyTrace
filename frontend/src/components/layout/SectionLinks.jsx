import { NavLink } from 'react-router-dom';
import {ArrowLeft,ArrowRight,Clock,QrCode,ClipboardCheck,CalendarDays,FileText,Users,ScrollText,Settings,FolderCheck} from 'lucide-react';
const SECTION_ICONS={attendance:Clock,scan:QrCode,discrepancies:ClipboardCheck,'office-qr':QrCode,'qr-codes':QrCode,
  assistants:Users,users:Users,semesters:CalendarDays,reports:FileText,dtrs:FileText,cases:FolderCheck,absences:CalendarDays,audit:ScrollText,settings:Settings,'historical-hours':Clock,'schedule-review':CalendarDays};
export default function SectionLinks({ links, label = 'Section navigation' }) {
  return <nav aria-label={label} className="mb-5 grid min-w-0 gap-2 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap">
    {links.map(([to, text, icon]) => {
      const Icon=icon??(text.startsWith('Back')?ArrowLeft:SECTION_ICONS[to.split('?')[0].split('/').at(-1)]??ArrowRight);
      return <NavLink key={to} to={to} end className={({isActive}) => `inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${isActive ? 'border-teal bg-teal text-white' : 'border-line bg-surface text-teal hover:bg-canvas'}`}><Icon aria-hidden="true" className="h-4 w-4 shrink-0"/><span className="min-w-0 break-words">{text}</span></NavLink>;
    })}
  </nav>;
}
