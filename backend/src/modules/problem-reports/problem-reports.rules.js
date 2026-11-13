import {z} from 'zod';
import {AppError} from '../../utils/response.js';
export const reportInput=z.object({category:z.enum(['calculation','qr','login','display','other']),title:z.string().trim().min(5).max(160),
 description:z.string().trim().min(10).max(4000),expected:z.string().trim().min(5).max(2000),pagePath:z.string().max(500)}).strict();
export const updateInput=z.object({status:z.enum(['new','investigating','resolved']),response:z.string().trim().max(2000)}).strict()
 .refine(value=>value.status!=='resolved'||value.response.length>0,{message:'Add a reply explaining the resolution.',path:['response']});
const sections={student:['attendance','dtr','absences','cases','concerns','profile','scan','discrepancies','co-workers','teammates','catch-up'],
 supervisor:['assistants','schedule-review','dtr-review','office-qr','attendance','discrepancies','absences','cases','concerns','reports','profile','scan','historical-hours','catch-up'],
 admin:['users','offices','semesters','reports','dtrs','concerns','settings','profile','qr-codes','audit','discrepancies','cases','absences','historical-hours','catch-up']};
export function requireReporter(actor){if(!sections[actor?.role]||!actor.institutionId)throw new AppError(403,'FORBIDDEN','Only institution users can submit and view their own problem reports.');}
export function safePagePath(value,role) {
 const path=String(value??'').split(/[?#]/)[0];const [,prefix,section]=path.split('/');
 return prefix===role&&sections[role]?.includes(section)?`/${role}/${section}`:`/${role}`;
}
export function browserLabel(agent='') {
 if(/Edg\//.test(agent))return 'Microsoft Edge';if(/Firefox\//.test(agent))return 'Firefox';
 if(/Chrome\//.test(agent))return 'Chrome';if(/Safari\//.test(agent))return 'Safari';return 'Other browser';
}
export function canReadReport(actor,row) {
 return Boolean(row&&(actor?.role==='superadmin'||(sections[actor?.role]&&actor.id===row.reporter_id&&actor.institutionId===row.institution_id)));
}
