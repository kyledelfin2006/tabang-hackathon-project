# PLAN-2 implementation evidence

Updated: 2026-10-25  
State: Local Supabase integration and exact-head CI database policy verification pass; hosted migration gates remain open.

## Implemented

- Initialized the Supabase CLI project and added three versioned migrations for the core schema, business functions, and private Storage policies.
- Added the pinned Supabase JavaScript SDK and CLI, public client configuration, build-time environment checks, and server-only admin client configuration.
- Switched the client auth gateway and application repositories to Supabase while retaining their public method shapes and provider-independent domain logic.
- Added the Supabase-backed Node partner API store and selected it for `/api/v1`. Existing `/api/app/*`, custom Postgres storage, and Render file paths remain during this transition because the replacement gates have not all passed.
- Added the local Supabase policy test suite and changed CI to start/reset the local Supabase stack before running it.
- Kept report photos and identity evidence in private buckets with role- and owner-scoped policies. The server secret key is read only by the Node server adapter.
- Updated CSP for the configured Supabase origin.

## Verification

`npm run check` passed on 2026-10-25 after PLAN-3 corrected the reported migration ordering and policy-test adapter imports:

- Lint, secret scan, and contrast checks passed.
- 24 unit test files passed (241 tests).
- 44 server tests passed.
- Production Vite build passed using local placeholder public Supabase configuration; `.env.local` containing those placeholders was removed afterward.

The local Supabase stack could not be started from this environment. Docker access returned a permission error for `npipe:////./pipe/dockerDesktopLinuxEngine`; `npm run supabase:start` remained blocked on that pipe and was stopped. Therefore `npm run supabase:reset` and `npm run test:policies` were not run locally. GitHub CI verification is recorded below. No Supabase project is connected to the session, so no hosted migration was applied.

Exact-head CI passed for PR #8 at commit `a122c5ac567f6e079956d62a28fca79f2a4488f3` on 2026-10-25. The `check` job passed. The `policies` job started the Supabase stack, reset the local database from migrations, exported local settings, and passed all 55 policy/repository tests. This verifies the migration and corrected adapter imports in CI despite the local Docker limitation above. No hosted Supabase project is connected to the session, so no hosted migration was applied.

## Gates still open

1. Connect the intended Singapore staging project and verify its project ref, region, and migration history before applying the reviewed migrations.
2. Inventory Render database rows and uploaded files using authorized source credentials. No hosted credentials were present in this workspace, so data presence is still unknown. Export and rehearse import for any data/files found; retain backups outside Git.
3. Review the generated migration plan with `supabase db push --dry-run`, import and reconcile source records and private objects, and verify password reset and app/partner flows.
4. Complete user review and the maintenance-window cutover only after staging checks pass. Reconcile writes before any rollback after Supabase accepts production writes.
5. Remove the custom Render app auth, `/api/app/*`, disk file endpoints, `pg` app store/migration path, and Render database/disk configuration only after the replacement is verified. Preserve the Node host and `/api/v1` partner API.

No hosted Supabase or Render resource was changed. No hosted schema was pushed, no data was exported or imported, and no production cutover occurred. FEAT-002 remains the historical Render implementation record; PLAN-2 remains the approved target direction and supersedes its target-provider decision.
