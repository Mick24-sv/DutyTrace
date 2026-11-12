import { z } from 'zod';
import { isDateKey } from '../semesters/semester.rules.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const agendaEventSchema = z.object({
  title: z.string().trim().min(1).max(160),
  date: z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(isDateKey, 'Choose a valid date.'),
  allDay: z.boolean(),
  startsAt: time.nullable(),
  endsAt: time.nullable(),
  notes: z.string().trim().max(2000).default(''),
}).strict().superRefine((event, ctx) => {
  if (event.allDay) {
    if (event.startsAt !== null || event.endsAt !== null) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'All-day events must not include times.' });
  } else if (!event.startsAt || !event.endsAt || event.endsAt <= event.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Choose a start and end time. End time must be after start time.' });
  }
});
