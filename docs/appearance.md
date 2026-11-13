# Personal appearance

School users open **Account menu → Appearance**. Superadmins open **Account settings → Appearance**. The protected route is `/<role>/appearance` for all four roles.

The page offers Light, Dark, and System themes; Teal, Blue, Violet, Rose, and Amber accents; and Comfortable or Compact spacing. Controls update the current interface and the sample dashboard immediately. A Save/Discard bar appears for changes. **Save changes** persists them to the signed-in account; **Discard** restores the saved version. Leaving the page discards an unsaved preview. **Reset to default** previews Light/Teal/Comfortable and still requires Save when it differs from the account settings.

System follows `prefers-color-scheme` while the app is open. Compact reduces desktop card/table spacing and preview row spacing; it does not shrink type, alter student requirements, or reduce mobile touch targets. Success, warning, and error colors remain semantic, independent of the accent.

`AppearanceProvider` lives inside `AuthProvider`. It fetches `/auth/appearance` when the account ID changes, scopes local cache entries by user ID, and ignores stale responses after an account switch. A small same-origin external script applies allowlisted cached preferences before the app paints. Last-saved appearance is used on public pages; the next signed-in account receives its own saved preferences. First visits on a new device still require the authenticated server fetch. Private browsing/storage failures do not prevent server-side saving.

`user_appearance_preferences` (migration 0046) has one row per account, with validated theme/accent/density values. Authenticated GET/PUT endpoints derive the owner from the session and reject additional account IDs or arbitrary CSS. The table has RLS enabled and no public Supabase client privileges. Appearance preferences do not change institution-wide settings. No existing accounts are assigned a new appearance by migration.

Theme variables and legacy component compatibility rules are in `frontend/src/styles/appearance.css`. `--color-navy` represents heading text; separate `--color-brand` and `--color-action` variables keep navigation/buttons readable in dark mode. `--color-teal` is the active accent text/indicator token, while `--color-accent-solid` supplies contrasting white-label button backgrounds. Branding illustrations retain their brand colors.

Checks:

```powershell
node --test frontend/tests/appearance.test.js backend/tests/appearance.test.js
node backend/scripts/check-appearance.mjs
npm.cmd run build
```

The database check creates temporary accounts inside a rolled-back transaction. It verifies all four roles, defaults, saved values, account isolation, and Supabase client access without retaining any test settings.
