import Badge from '../ui/Badge.jsx';
import { ABSENCE_STATUS, CASE_STATUS } from './labels.js';

export const AbsenceStatusBadge = ({ status }) => <Badge tone={ABSENCE_STATUS[status]?.tone ?? 'neutral'}>{ABSENCE_STATUS[status]?.label ?? status}</Badge>;
export const CaseStatusBadge = ({ status }) => <Badge tone={CASE_STATUS[status]?.tone ?? 'neutral'}>{CASE_STATUS[status]?.label ?? status}</Badge>;
