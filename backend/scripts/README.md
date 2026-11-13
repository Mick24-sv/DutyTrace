# Maintenance and verification scripts

Run these commands from the repository root.

| Script | Purpose |
| --- | --- |
| `setup-superadmin.ps1` | Privately prompts for a password and creates the separate maintainer account |
| `review-database.mjs` | Read-only schema, migration, retention, and storage inventory |
| `check-database-boundary.mjs` | Checks Supabase client privileges and denies direct user-table reads |
| `check-institution-onboarding.mjs` | Rollback-only institution/invitation workflow checks |
| `check-superadmin-account.mjs` | Rollback-only password/email change checks |
| `check-problem-reports.mjs` | Rollback-only report access, screenshot, and status checks |
| `check-login-security.mjs` | Rollback-only login race and lockout checks |
| `check-appearance.mjs` | Rollback-only appearance defaults, persistence, account isolation, and public-access checks |
| `check-browser-policy.mjs` | Checks the built frontend under production headers with fake local API responses |
| `check-secret-exposure.mjs` | Checks source/build files for configured secret values without printing them |

For example:

```powershell
node backend/scripts/review-database.mjs
node backend/scripts/check-database-boundary.mjs
```

These tools use the existing backend environment configuration. The review writes its generated metadata to `database/schema-review.json` at the repository root. Rollback checks retain no test records, but PostgreSQL sequence counters can advance.

All project maintenance checks are kept in this folder, including browser and repository-wide checks. Account setup instructions are in [institution onboarding](../../docs/institution-onboarding.md).
