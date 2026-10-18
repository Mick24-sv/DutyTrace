# API Endpoints

Base path: `/api`. Responses are `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`. `details` holds field-level validation messages on `400 VALIDATION_ERROR`.

Authentication is a cookie (`dt_session`, httpOnly). Status codes: `401` = not signed in, `403` = signed in but not allowed, `404` = not found, `409` = conflict, `429` = rate limited.

| Method & path | Who | Description |
| --- | --- | --- |
| `GET /health` | public | Liveness check |
| `GET /institutions/me` | signed in | Current user's institution settings |
| `PUT /institutions/me` | admin | Update only the administrator's institution name and IANA timezone |
| `POST /auth/login` | public (rate limited) | `{ email, password }` → sets session cookie, returns `{ user }` |
| `POST /auth/logout` | anyone | Revokes the session on the server and clears the cookie |
| `GET /auth/me` | signed in | Current user (role, office) |
| `GET /users` | admin | All users with their current office |
| `POST /users` | admin | Create account `{ email, fullName, role, password (≥10 chars), officeId? }` |
| `GET /users/:id` | admin, or the user themself | One user |
| `PATCH /users/:id` | admin | Change `fullName`, `role`, `status`. Cannot demote/disable yourself. Disabling signs the user out. |
| `PUT /users/:id/assignment` | admin | `{ officeId }` (or `null` to unassign). Ends the old assignment, keeps history. |
| `GET /offices` | admin (own institution), supervisor (own office only) | List offices |
| `POST /offices` | admin | Create office `{ code, name }` |
| `GET /offices/:id/assistants` | admin, or the supervisor assigned to that office | Student assistants currently assigned |

`User` shape: `{ id, email, fullName, role, status, institutionId, institution: { id, name, timezone } | null, office: { id, code, name } | null }`. Password hashes are never returned.

### QR codes (administrator only)

| Method & path | Description |
| --- | --- |
| `GET /offices/:id/qr` | Active code (with its printable `payload`) and a history of revoked codes; office must belong to the admin's institution |
| `POST /offices/:id/qr` | Generate the first code. `409 QR_EXISTS` if one is already active |
| `POST /offices/:id/qr/regenerate` | Revoke the active code and issue a new one |
| `POST /offices/:id/qr/revoke` | Revoke without replacement. `409 NO_ACTIVE_QR` if none |

### Attendance

| Method & path | Who | Description |
| --- | --- | --- |
| `GET /attendance/status` | student, supervisor | `{ state: 'timed_in'\|'timed_out', since, office, timezone }` |
| `POST /attendance/scan` | student, supervisor | `{ action: 'time_in'\|'time_out', qrPayload }`. Records the **signed-in user's own** event. Any other field (user id, timestamp) is ignored. `201` with `{ event, state, office, timezone, session }` |
| `GET /attendance/me?month=YYYY-MM` | student, supervisor | Own history: `days[]` (sessions with `status`, `counted`, `seconds`, `flags`), `totals` (recorded hours, counts, `verifiedHours: 0`) |
| `GET /attendance/users/:userId?month=` | supervisor (students in own office), admin (read-only, same institution) | Someone else's history. Students get `403` |
| `GET /attendance/office/:officeId/summary?month=` | supervisor (own office), admin | Per-assistant monthly totals and current state |

Scan error codes: `400 INVALID_QR` (not ours, tampered, unknown), `400 QR_REVOKED`, `403 WRONG_OFFICE`, `403 NOT_ASSIGNED`, `403 OFFICE_INACTIVE`, `409 ALREADY_TIMED_IN`, `409 NO_ACTIVE_SESSION`. Session `status` values: `complete`, `in_progress`, `missing_time_out`, `orphan_time_out`, `needs_review`.

### Monthly DTR and policy (Phase 4)

| Method & path | Who | Description |
| --- | --- | --- |
| `GET /dtrs/policy` | signed in | `{ requiredMonthlyHours, timezone, requiredHoursConfirmed: false, officialTemplate: false, updatedAt, updatedBy }` |
| `PUT /dtrs/policy` | admin | `{ requiredMonthlyHours }` (> 0, <= 744). Affects DTRs generated afterwards; audited |
| `GET /dtrs/mine` | student | The last 12 **ended** months with the DTR (if any) of each, plus `verifiedHoursTotal` (approved DTRs only) |
| `GET /dtrs/preview?month=YYYY-MM` | student | Computed snapshot of an ended month; **nothing is stored**. `409 MONTH_NOT_ENDED` for current/future months |
| `POST /dtrs` | student | `{ month }`. Creates the draft (revision 1), or adds a new revision while the DTR is `draft` / `needs_correction`. `409 DTR_LOCKED` otherwise; `403 NOT_ASSIGNED` without an office |
| `GET /dtrs?status=&month=` | student (own), supervisor (own office, submitted and later, never their own), admin (same institution) | List with `recordedHours`, `verifiedHours` (null unless approved), `incompleteCount` |
| `GET /dtrs/:id?revision=n` | owner, office supervisor (not drafts), admin | Detail: the chosen revision's snapshot, all `revisions`, full `history` (actor, role, time, reason), `latestReturnReason`. Unknown ids and other people's ids both give `403` |
| `GET /dtrs/:id/pdf?revision=n` | same as above | `application/pdf` attachment (provisional template) |
| `POST /dtrs/:id/submit` | the owning student | `draft` or `needs_correction` -> `submitted` |
| `POST /dtrs/:id/start-review` | office supervisor | `submitted` -> `under_review` |
| `POST /dtrs/:id/approve` | office supervisor | `{ acknowledgeIncomplete? }` `under_review` -> `approved`, sets `verifiedHours` = counted hours. `409 INCOMPLETE_NOT_ACKNOWLEDGED` if the DTR has flagged sessions and the flag is not `true` |
| `POST /dtrs/:id/return` | office supervisor | `{ reason }` (required, <= 1000 chars) `under_review` -> `needs_correction` |
| `GET /dtrs/review-counts` | supervisor | `{ submitted, underReview }` for the dashboard |

Workflow error codes: `409 INVALID_TRANSITION`, `409 DTR_LOCKED`, `409 MONTH_NOT_ENDED`, `409 INCOMPLETE_NOT_ACKNOWLEDGED`, `403 SELF_REVIEW`, `403 FORBIDDEN`. `GET /attendance/me` and `/attendance/office/:id/summary` now return the real `verifiedHours` (and `verificationAvailable: true`) for a month once its DTR is approved; otherwise `0` / `false`.

### Absence notices, cases and documents (Phase 5)

Dates are `YYYY-MM-DD`. A student's own id, their office and all timestamps come from the session and the server clock, never from the request body. Unknown ids and other people's ids both return `403`.

| Method & path | Who | Description |
| --- | --- | --- |
| `POST /absences` | student | `{ absenceType: 'planned'\|'unexpected', startDate, endDate?, reason }`. `201`. Planned = starts today or later, unexpected = starts today or earlier, at most 31 days. Does **not** excuse anything |
| `GET /absences?status=` | student (own), supervisor (own office, not their own), admin (read-only) | `{ timezone, absences[] }` |
| `GET /absences/summary` | student, supervisor | Counts per status |
| `GET /absences/:id` | owner, office supervisor, admin | Notice, `documents`, `history`, `actions` (what this viewer may do now) |
| `POST /absences/:id/acknowledge` | office supervisor | `{ response? }` pending -> acknowledged |
| `POST /absences/:id/review` | office supervisor | `{ response }` (required) -> reviewed (final) |
| `POST /absences/:id/follow-up` | office supervisor | `{ response }` (required) -> needs_follow_up |
| `POST /absences/:id/respond` | owner | `{ message }` needs_follow_up -> pending |
| `POST /absences/:id/documents?filename=` | owner | Body = the file. `201` |
| `POST /absences/:id/receipts` | office supervisor | `{ method: 'email'\|'in_person', receivedDate (<= today), receivedById?, notes? }`. Records a receipt; no file |
| `GET /cases/types` | admin | Case types |
| `POST /cases/types` | admin | `{ code, name, description?, requiredDocuments[] }` |
| `PATCH /cases/types/:id` | admin | `{ name?, description?, requiredDocuments?, isActive? }` (affects only cases opened afterwards) |
| `POST /cases` | admin | `{ userId, caseTypeId, description, periodStart, periodEnd, requirements? }`. `201`, reference `CC-YYYY-NNNNNN` |
| `GET /cases?status=&userId=` | student (own), supervisor (own office), admin | `{ timezone, cases[] }` with `missingRequirements` |
| `GET /cases/summary` | all roles | Counts per status |
| `GET /cases/:id` | owner, office supervisor, admin | Case, `requirements`, `documents`, `history`, `actions`. The decision is shown only once resolved/closed |
| `POST /cases/:id/submit` | owner | `{ message? }` open/documents_pending -> under_review; `409 DOCUMENTS_MISSING` lists what is missing |
| `POST /cases/:id/respond` | owner | `{ message }` needs_correction -> under_review |
| `POST /cases/:id/documents?filename=&requirementId=` | owner | Body = the file |
| `POST /cases/:id/start-review` | admin | -> under_review |
| `POST /cases/:id/request-correction` | admin | `{ note }` under_review -> needs_correction |
| `POST /cases/:id/resolve` | admin | `{ decision, resolutionDate? (<= today) }` under_review -> resolved |
| `POST /cases/:id/reopen` | admin | `{ reason }` resolved -> under_review |
| `POST /cases/:id/close` | admin | `{ note }` any non-closed state -> closed (final) |
| `POST /cases/:id/requirements` | admin | `{ label }` add a requested document |
| `POST /cases/:id/requirements/:rid/waive` | admin | `{ reason }` |
| `POST /cases/:id/notes` | admin, office supervisor | `{ note }` |
| `POST /cases/:id/receipts` | admin, office supervisor | `{ method, receivedDate, receivedById?, notes?, requirementId? }` |
| `GET /documents/:id/download` | owner, office supervisor of the record, admin | The file as an attachment. Access is checked on every request and audited; `404 NO_FILE` for manual receipts |

Case types, cases, absences, documents, reports, offices, users and academic terms are scoped to the signed-in administrator's institution. Cross-institution resource ids are denied.

### Institution academic terms and semester requirements

| Method & path | Who | Description |
| --- | --- | --- |
| `GET /semesters/current` | admin, supervisor | Current term for the user's institution |
| `GET /semesters/current/office` | supervisor | Current term progress for the supervisor's own office |
| `GET /semesters/mine` | student | Current and historical terms with recorded hours, approved-DTR verified hours, individual requirement and progress |
| `GET /semesters` | admin | This institution's configured terms |
| `POST /semesters` / `PUT /semesters/:termId` | admin | Create/update an institution-specific academic year, semester, dates, deadline and timezone; dates cannot overlap |
| `POST /semesters/:termId/finalize` | admin | Permanently lock the term calendar and requirements |
| `GET /semesters/:termId/requirements` | admin | Students, office and current individual requirement assignments |
| `PUT /semesters/:termId/requirements/:studentId` | admin | Assign/update `{ officeId, requiredHours }`; updates append audit/history rows; `requiredHours: null` removes the requirement |
| `GET /semesters/:termId/office/:officeId` | admin, supervisor (own office) | Semester progress; administrators see only their institution |
| `GET /reports/semester-hours?termId=&officeId=&format=` | admin, supervisor (own office) | Recorded/verified semester totals, individual targets, remaining hours and capped completion percentage; supports CSV |

Error codes added: `400 VALIDATION_ERROR` (including unsupported or mismatched file type), `413 FILE_TOO_LARGE`, `409 TOO_MANY_DOCUMENTS`, `409 DOCUMENTS_MISSING`, `409 INVALID_TRANSITION`, `404 FILE_MISSING`.

### Reports & Dashboards (Phase 6)

Authorized roles: `admin` (all offices in their institution or filtered), `supervisor` (scoped strictly to own assigned office; other office requests return `403`). All endpoints support JSON (default) and CSV download (`format=csv`).

| Method & path | Who | Description |
| --- | --- | --- |
| `GET /reports/dashboard-stats` | admin, supervisor | Real aggregated dashboard metrics (attendance, DTRs, hours, cases, absences, documents) |
| `GET /reports/attendance?officeId=&userId=&from=&to=&month=&page=&limit=&format=` | admin, supervisor | Attendance sessions by student and office with complete/incomplete status and duration |
| `GET /reports/hours?officeId=&month=&page=&limit=&format=` | admin, supervisor | Recorded vs. verified hours, monthly required hours target, deficit, and DTR status |
| `GET /reports/dtr?officeId=&month=&status=&page=&limit=&format=` | admin, supervisor | Monthly DTR status breakdown, revision numbers, reviewer, and recorded/verified hours |
| `GET /reports/outstanding-requirements?officeId=&month=&page=&limit=&format=` | admin, supervisor | Students below duty-hour requirement with shortfall deficit hours and completion status |
| `GET /reports/absences?officeId=&status=&type=&from=&to=&page=&limit=&format=` | admin, supervisor | Absence notifications with review status, responses, dates, and attached document counts |
| `GET /reports/cases?officeId=&status=&caseTypeId=&from=&to=&page=&limit=&format=` | admin, supervisor | Compliance cases with reference, type, review status, missing requirements, and decisions |
