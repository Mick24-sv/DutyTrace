# Institution onboarding

DutyTrace separates platform maintenance from institution administration. A `superadmin` has no institution membership and can register schools and invite their first administrators. It cannot access school operational API routes. Existing institution accounts and records retain their institution IDs.

## Initial maintainer

Apply migrations with `npm.cmd run db:migrate`. Create the first, separate maintainer account from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\setup-superadmin.ps1 -Email 'maintainer@example.com' -FullName 'Platform Maintainer'
```

This prompts privately for a password and confirmation. It passes the password through a short-lived process environment, hashes it with the existing password helper, then clears that environment. Never commit passwords to `.env` or put them in command arguments. The script refuses to overwrite existing accounts or create another maintainer when one already exists. There is no public superadmin signup.

Sign in through the normal login page. The superadmin opens `/superadmin`; institution admins continue to open `/admin`.

## Maintainer account settings

Select the gear/account link in the platform header to open `/superadmin/account`. Password changes require the current password, invalidate old password-reset links and pending email changes, and revoke other sessions while preserving the requesting session.

Email changes require the current password and a configured email provider. The current email remains active until the new inbox receives a one-time link and the maintainer confirms their current password through it. Links expire after 30 minutes. Replacing or cancelling a request disables its prior link; password changes invalidate pending requests too. Tokens are stored only as hashes, travel in URL fragments, and are submitted through POST bodies. Completing an email change invalidates outstanding password-reset links and revokes other sessions. Requests cannot choose another account ID, role, or institution.

`node backend/scripts/check-superadmin-account.mjs` checks the flow against the configured database with simulated delivery and a rolled-back transaction. It leaves real accounts unchanged.

## Register a school

1. Select **Create institution**.
2. Enter its verified name, acronym, type, address, city, and contact email.
3. Enter the designated first administrator’s full name and unused email.
4. Select **Create & invite admin**.

School and invitation creation are atomic. Each institution gets its own duty requirement and DTR defaults. School configuration such as offices and academic terms is left to that school’s administrator.

When Brevo/SMTP is configured, an invitation is handed to the provider. This is delivery handoff, not a claim that the message reached the inbox. With no email provider configured, a one-time link appears only in the creation response for the authenticated superadmin to share privately. The raw token is never stored, listed, or written to the audit log.

Delivery failure keeps the school, disables that token, and offers another invitation. Reissuing rotates the token and disables the previous link. Pending invitations can also be revoked.

## Accept an invitation

The recipient opens `/accept-invitation#token=…`. The fragment prevents the token from reaching ordinary HTTP URL logs. The page removes it from visible browser history, posts it in request bodies, and requires a password of at least ten characters. Validity is rechecked under database locks during acceptance. Links expire after 48 hours and work once.

Acceptance creates an active `admin` account only for the invitation’s institution. The recipient signs in normally afterward. Existing emails cannot be used to move or promote another account. Users already signed in are asked to sign out explicitly before acceptance.

## Scope and verification

Platform API routes require `superadmin`; public invitation routes are rate limited. All other school API routes reject platform accounts. Institutions remain isolated through the existing institution-scoped services. School administrators cannot create platform accounts or register other institutions. Platform creation, invitation, acceptance, and revocation actions are audited without secrets.

Directory **Active** means the school has an active institution administrator; it is not a school verification badge. This release does not implement public school registration, bug reports, subscriptions, or routine cross-school access to private student records.

Run unit checks with `node --test backend/tests/platform-rules.test.js frontend/tests/loginDestination.test.js`. The optional `node backend/scripts/check-institution-onboarding.mjs` exercises creation, acceptance, duplicates, rotation, revocation, delivery failure, and account scope against the configured database inside a rolled-back transaction. It mocks email delivery and retains no test school, user, invitation, or audit records. Normal PostgreSQL sequence counters can advance during the check.
