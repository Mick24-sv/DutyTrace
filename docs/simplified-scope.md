# Current product scope

DutyTrace centers on QR attendance, attendance corrections, monthly DTR approval, and semester hour completion.

## Navigation

- Students: Home, Attendance, Monthly DTR, Absence Notices.
- Supervisors: Home, Student Assistants, DTR Review, Absence Notices.
- Administrators: Home, Students & Staff, Offices, Academic Terms, Reports, Settings.

Administrators open a student name in Students & Staff to view the Student Assistant Overview (`/admin/users/:userId`). The page shows real account details, current office assignment, term-specific verified and required hours, remaining hours, and completion progress. It also offers read-only attendance history and links to recent DTRs. On mobile, the account's expanded controls include View student overview. The overview API (`GET /users/:id/student-overview`) is administrator-only and restricted to the administrator's institution. Semester requirements remain managed under Academic Terms; no profile photos, program, or year-level values are fabricated.

Attendance contains history, time-in/out, and correction requests. Supervisors edit times from a student's attendance history. Student Assistants also links to office QR codes and correction reviews; occasional reports, personal attendance, and historical official-record imports are under More office tools.

Student Assistants includes an Attendance & progress view and a Historical duty hours view. Historical entries use a responsive two-step form, with previous entries filtered to the selected student and term. The student attendance page links to this form with that student preselected. Saving refreshes the attendance and semester summaries. Finalized-term, exceptional, and amendment submissions retain administrator approval requirements.

Before a historical entry is saved, the form checks `/historical-duty-hours/eligibility` for the selected student, term, and month. A month containing QR attendance, an approved DTR with verified hours, existing approved/pending historical entries, or only part of a term cannot receive a new monthly total. The form switches to date-level entry, clears the monthly hours, and offers dates without QR or existing historical coverage. The save API retains its independent overlap checks. A monthly paper-DTR total must not be copied into a daily entry or added on top of QR hours that it already includes.

Academic Terms owns term dates and individual semester requirements. Administrators finalize a term directly with confirmation, locking its calendar and assignments; balances stay with their original term. Finalization does not create the next term, carry balances forward, or decide compliance.

Supervisor Home also shows student preferred duty times (with a link to review preferences) and a monthly duty-hours matrix. The matrix separates QR-recorded hours from historical official-record credits and shows each student's requirement and remaining approved hours. Preference review is a secondary page reached from Home; it does not add another sidebar item.

The Students Below Duty-Hour Requirements panel on Supervisor Home shows semester progress, recorded monthly hours, verified semester hours, and remaining hours. Its detailed-report link opens the semester progress report directly.

The monthly hours matrix displays DTR verified hours (including supervisor-entered monthly totals), QR-recorded hours, and historical verified credits as separate figures. Its total is the semester's verified total, including historical credits, matching the remaining-hours calculation. The overview reloads on window focus and offers a manual Refresh overview action.

Reports shows only attendance sessions, DTR status, and semester progress. Settings links to QR management, attendance corrections, audit history, historical credit review, and compliance cases. Absence notices and existing compliance cases remain supported pending confirmation of capstone requirements.

## Deferred features

Student duty-preference editing, recovery planning, completion forecasts, advanced alert dashboards, policy template management, and the semester transition planner are deferred. Supervisor preference viewing and review remain available from Home. Old deferred URLs redirect to the relevant active workspace. Deferred notifications are excluded from the inbox, unread count, and outbound email queue; the scheduler runs core reminders and attendance reconciliation rather than forecast/risk detection.

Backend modules and database records for these features remain because historical records, attendance reconciliation, and policies depend on them. Removing them physically requires a separate dependency and data-retention review. No tables or migration history are deleted by this cleanup.

New QR scans do not require an approved schedule. New DTRs use the student's monthly override or the institution's monthly target in Settings; deferred policy templates no longer override those targets. Previously saved attendance and DTR policy snapshots remain intact.

## Hour labels

For status detection, an explicit completion deadline takes priority; otherwise the semester end date is used. Missing a separate deadline does not make an otherwise configured semester Not configured. No frontend explanation or legend is added.

Semester progress includes six advisory statuses: On track (green), At risk (amber), Overdue (red), Completed (green), Insufficient data (gray), and Not configured (gray). All roles use the same server calculation. Completion requires verified hours meeting the assigned target; otherwise a missing target/deadline is Not configured, and a passed local deadline is Overdue. Pace uses counted attendance within the latest 28 days, requiring at least two duty dates and seven observed calendar days; it never verifies those recorded hours. Frontend surfaces display labels and colors only, without definitions or a legend. Administrator Home also shows counts by status.

Monthly DTR actions open dedicated pages: Prepare DTR opens `/student/dtr/preview/:month`, Create draft opens the saved DTR, and Continue draft or View DTR opens that document directly. Page navigation resets the scroll position so the title and next action remain visible. Preparing a preview does not create or submit a DTR.

Students can propose clock-time corrections beside sessions in their current DTR revision, including QR sessions and DTRs under review. A reason is required; requests preserve original scans and do not change hours until the assigned supervisor approves them in Attendance corrections. Pending requests block DTR approval. After approval of a time correction, an unapproved DTR must be returned (if locked), regenerated, and resubmitted before it can be approved. Approved DTR snapshots remain immutable and use separate approved adjustments. Pending requests and their status are visible on the DTR page.

Supervisors may instead choose **I will edit this DTR** while it is under review. A required message notifies the student and records the supervisor's takeover in the DTR history. While the supervisor is editing, students wait for the decision. The supervisor can correct times directly on the DTR page and approve final monthly verified hours without requiring student regeneration. Outstanding student requests must first be approved or rejected.

**Set verified hours & approve** records a required explanation/reference and duty credit date, creates a new supervisor-authored revision using latest attendance, and locks the approved DTR. Recorded hours and the final verified amount are shown separately to both roles and in the PDF. The manually verified monthly total is allocated to the semester containing its duty credit date, rather than being added on top of the same QR sessions. Historical credits remain separate. Subsequent approved attendance adjustments change the manual total by the correction's hour difference rather than replacing it with the QR-only total. No schema migration is needed for this workflow.

Recorded hours come from completed attendance sessions. Approved hours are verified by an approved DTR or an authorized tracked adjustment. Semester completion uses approved hours. Historical official-record credits remain separate from editing QR attendance.

## Deployment

My Profile includes Add/Change/Remove profile picture. PNG and JPEG uploads are limited to 2 MB, stored privately in PostgreSQL (migration 0031), and served through an authenticated, institution-scoped photo endpoint. Students may change only their own photo; their assigned supervisor and institution administrator can view it. Account-menu avatars and the administrator overview use the saved photo, falling back to initials. Photo bytes never appear in session/user JSON or audit logs.

Student Assistants edit their name, optional year level (1–8), and course/program under the account menu → Edit my profile (`/student/profile`). Updates are audited and visible in the administrator's student overview. The self-service endpoint accepts only these fields; role, email, office, status, and hour requirements remain staff-managed. Earlier DTR snapshots retain their original profile details. Migration 0030 adds nullable year_level and course columns to existing users.

Monthly supervisor verification offers **Whole month** (the default) or a **Specific duty credit date**. Whole-month verification requires an assigned term that fully contains the month; its verified hours count once toward that covering term and monthly reports. Partial-month ranges do not prorate this monthly decision. Date-specific verification remains available for months crossing a term boundary. Both the student-visible document and PDF identify the selected period.

This interface cleanup requires updated frontend and backend deployments, with no additional database migration. Existing migrations through 0029 are still required for supervisor attendance amendments.


Supervisors can verify completed, unflagged attendance sessions from a student's attendance history before month-end. Each verification records the exact times, reviewer, explanation, and a student notification. Corrected times need verification again. These hours count immediately toward semester progress; an approved monthly DTR replaces session verification totals for its month, preventing double-counting. QR recording stays open.


Concerns is available in every role's navigation. Students can contact their office supervisor or an administrator; supervisors can contact their assigned students or an administrator; administrators can contact students and supervisors in their institution. Conversations are private to participants. A supervisor can forward a student-initiated concern to a selected administrator, granting conversation access and leaving a visible message for the student. Staff participants can mark Open, Under review, or Resolved; resolved concerns must be reopened before replies. Every message, forwarding action, and status update creates in-app notifications and audit metadata. Lists and messages are paginated, recipient search is bounded, and the conversation pane scrolls on mobile.


Admin and supervisor home screens include animated semester completion donuts. Admin shows students with requirements split into Completed and Still completing, with unassigned requirements counted separately; supervisor includes No requirement assigned as a third segment for their office. Segments sweep clockwise from 12 o'clock in sequence, and legend rows appear as each sweep finishes. Reduced motion displays the final chart immediately. Segments and legends open the semester progress report with the matching completion filter, which also applies to CSV exports. Counts come from configured requirements and verified remaining hours, not predictive risk statuses.


Admin Students & Staff includes a portrait spotlight above the Student Assistants list. It shows up to three real students from the filtered, paginated page; the selected portrait springs to 1.38 scale while neighboring portraits step back. The photo-only slideshow advances every seven seconds, with previous/next and play/pause controls. It pauses on hover, focus, and hidden tabs, and disables automatic motion for reduced-motion preferences. The selected student's real academic details, office, verified current-semester progress, and profile link appear below. Missing photos use a neutral silhouette; no sample students or video testimonials are invented.


Supervisor Student Assistants uses compact, responsive cards for assigned active students, with profile photos (initials fallback), year/course, verified and remaining current-semester hours, attendance state, recorded monthly hours, review count, and a View attendance action. Search includes academic details and the existing pagination remains. Profile fields are returned by the office-scoped attendance summary; no extra per-student profile requests or database migration are needed.


Student Home shows My office teammates below semester progress only when other active students share the current office. A compact preview links to a searchable, paginated teammates directory. The student-only endpoint derives office scope from current duty assignments and exposes only name, photo reference, course, year, and office; it excludes the requesting student, disabled accounts, staff, and other offices. Students can read photos of active student teammates but cannot access their profiles, progress, attendance, email, or concerns. No database migration is required.
