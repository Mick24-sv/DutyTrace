# Database organization review

This inventory predates migration 0046, which adds the referenced `user_appearance_preferences` table. Re-run the review script for current counts; the figures below remain the original review snapshot.

This review inspected the configured Supabase database through read-only queries and compared it with backend source and migration files. No live table, index, function, bucket, or record was changed.

## Inventory snapshot

| Check | Result |
| --- | --- |
| Application tables | 55 |
| Indexes | 156 |
| Applied/local migrations | 45 / 45; checksums match; none pending or missing |
| Tables without backend source references | None found |
| Exact duplicate index groups | None found |
| Invalid indexes / unvalidated constraints | 0 / 0 |
| Application trigger functions | 35; all attached to triggers |
| Public views / materialized views | None |
| Application enums | 11; all have column references |
| Empty tables | 13; referenced by implemented features |
| Obvious test-data patterns | No matching rollback/test institutions, `example.invalid` accounts, or rollback problem reports |

Source references are lexical evidence, not proof that every feature is used daily. Naming-pattern checks do not prove that no demonstration data exists under ordinary names. Index scan counts can reset and do not establish that an index is unused.

## Priority finding: document storage consistency

There are seven document records. Two reference stored files; the other five are manual receipt records and correctly have no file.

- One matching object exists in the private `dutytrace-documents` Supabase bucket.
- One reference has no matching object in that bucket.
- Neither referenced file exists in this machine’s configured local upload directory.
- The current local backend configuration uses `DOCUMENT_STORAGE=local`.
- No unreferenced object was found in the configured bucket.

This is a storage/configuration or recovery concern, not evidence that the document rows are unimportant. A file may exist on an older deployment disk, another bucket, or a backup. Check those locations before changing settings or attempting recovery. Keep the document references and the existing bucket object. Switching providers alone would not restore the file absent from the bucket.

## Retention cleanup candidates

| Record type | Snapshot count | Recommendation |
| --- | --- | --- |
| Expired or revoked sessions | 372 | Choose a retention period; prune only sufficiently old terminal sessions and preserve active sessions |
| Expired or used password-reset tokens | 12 | Choose an authentication-token retention period; preserve currently valid requests |
| Terminal institution invitations | 0 | Nothing to prune; accepted invitations also provide onboarding history |
| Terminal email-change requests | 0 | Nothing to prune now |

Expiry/revocation already makes these credentials unusable. No purge was performed because the request was a review and no retention policy was specified.

## Keep these objects

- **Applied migrations:** required for reproducibility and checksum verification.
- **`policy_settings`:** a legacy compatibility row still read by the admin bootstrap. Ordinary DTR changes use `institution_dtr_policies`. Removing a tiny compatibility table is not a worthwhile immediate cleanup.
- **`users.required_hours`:** still used as a legacy monthly override by reports/user APIs; distinct from semester requirements.
- **Empty recovery and semester-transition tables:** referenced by implemented backend services/routes, even where simplified navigation does not expose the tools. Retirement requires a separate product/API decision.
- **Empty policy-template tables:** queried by the policy resolver when configured; an empty catalog is valid.
- **Empty invitations, email changes, agendas, and problem reports:** support newly implemented features.
- **Attendance, DTR history, audit, requirement versions, and historical credits:** preserve evidence and verified totals.
- **Profile image storage:** helps explain the larger users-table footprint; size alone does not establish clutter.

## Local organization improvements

The database README now has a migration catalog through 0045 and links to setup/review documentation. The schema guide covers newer workflows and corrects obsolete descriptions of roles, corrections, and verified-hour storage. The older deployment-readiness document is marked historical.

The new `backend/scripts/review-database.mjs` regenerates a read-only inventory. Its local `database/schema-review.json` is ignored by Git so changing deployment counts are not treated as schema source.

No database object was identified with sufficient evidence to recommend immediate removal. The safe next cleanup is a reviewed authentication-retention policy; investigate storage before document cleanup.
