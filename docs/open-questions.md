# Open Questions for ADNU

Nothing here has been confirmed. Until answered, the related settings stay configurable and any sample values are placeholders.

1. **Required duty hours:** how many per month/term, and do they differ by program or scholarship type?
2. **Official DTR format:** can we get the current template? Until then the DTR is a provisional, clearly labeled form.
3. **Timezone and month cutoff:** confirm local timezone and that a month's DTR is generated from the 1st of the next month.
4. **Attendance rules:** grace period for late time-in, maximum hours per day, handling of missing time-outs, and who may correct records.
5. **Verification:** what counts as "supervisor-verified"? Is partial approval allowed?
6. **Absences:** which absences may be excused, by whom, and does an excused absence change required hours?
7. **Compliance cases:** which requirements trigger a case, who reviews them, and what outcomes are possible?
8. **Documents:** accepted file types, retention period, and who may view them (data-privacy review).
9. **Offices and QR:** one QR per office? Acceptable QR rotation interval? Is on-site (Wi-Fi/geofence) checking permitted?
10. **Accounts:** are users provisioned from an official list, or can they register? Is school SSO (e.g., Google Workspace) available?
11. **Data privacy:** is review by the university data protection officer required before real student data is used?
12. **Password and account policy:** minimum password length (we use 10), lockout rules (we use 5 failures / 15 minutes), session length (we use 8 hours), and how forgotten passwords are handled (no reset flow exists yet).
13. **Who creates accounts and offices?** Currently administrators only; confirm this matches how SA and supervisor lists are maintained.
14. **Maximum session length:** we treat a completed session longer than 12 hours as "needs review" and do not count it (`MAX_SESSION_HOURS`). What limit, if any, does ADNU apply? Can a session legitimately cross midnight?
15. **Missing time-outs:** who may correct them, and how (this build only flags them; corrections arrive later as separate, auditable records)? Should a missing time-out ever count for partial hours?
16. **QR proof of presence:** is a static printed code acceptable, or does ADNU want a rotating code or location/Wi-Fi check? (A photographed static code could be scanned remotely.)
17. **Who may see attendance:** we allow supervisors to see students *currently assigned* to their office and administrators to see everyone, read-only. Confirm, including whether supervisors may see past assignees.
18. **Rounding and units:** hours are summed from seconds and shown to 2 decimals. Does ADNU round to the minute, quarter hour, or something else?
19. **DTR template:** the PDF is a provisional layout (see #2). Which fields, signatures, and wording does the official form require (e.g. supervisor signature, dean's signature, school-year header)?
20. **Required hours** (see #1) are a single configurable number (placeholder 40 per month) applied to everyone. Is the requirement per month, per term, or per scholarship type? Do months with holidays or exams change it?
21. **Approval semantics:** approving verifies only the *counted* hours and flagged sessions are excluded. Should a supervisor instead be able to approve some sessions, add hours for a missing time-out, or edit times? (Not possible now; those need an attendance-corrections feature.)
22. **Return and resubmit:** may a student resubmit without changing anything, how many times, and should there be a deadline for submission and review?
23. **Who reviews:** DTRs go to supervisors currently assigned to the office on the DTR. What if a supervisor is absent, offices have several supervisors, or a student worked in two offices in one month?
24. **Cutoff:** the DTR becomes available at local midnight at the end of the month. Does ADNU want a different cutoff (e.g. a grace window after the last day for late time-outs)?
25. **Retention and reopening:** an approved DTR can never be changed here. How should a genuine error in an approved DTR be corrected, and how long must DTRs be kept?
26. **Absence notices, deadlines and reasons:** how far ahead must a *planned* absence be reported, how soon after an *unexpected* one, and which reasons are valid? (The build only checks that dates are real and a notice is at most 31 days; it applies no deadline.)
27. **Excusing absences:** who decides whether an absence is excused and does that change required hours? (A notice never excuses anything in this build; "reviewed" only means a supervisor looked at it.)
28. **Who may read absence notices:** we allow the student, supervisors of the notice's office and, read-only, administrators. Reasons can include health details. Should administrators see them, and is a medical-privacy rule needed?
29. **Case types and triggers:** which situations lead to a compliance case, which documents each requires, and are there deadlines? (Case types are admin-configured; the demo ones are fictional.)
30. **Who decides cases:** only administrators resolve or close cases here. Should supervisors, a committee or the scholarship office decide, may supervisors request corrections, and what outcomes exist?
31. **Documents:** accepted file types (now PDF, PNG, JPEG), maximum size (now 5 MB), retention period, who may open them, and whether a data-privacy review or virus scanning is required before real files are stored.
32. **Reassigned students:** a notice or case stays with the office the student had when it was created, so a former supervisor keeps access to it. Is that right?
33. **Notifications:** should students and staff be emailed (for example through Gmail or school email) when a notice is reviewed or a case needs action? Not built; staff record received emails by hand.
34. **Withdrawing or replacing a document:** uploads are permanent here. May a student withdraw one, and who may delete files after the retention period?
