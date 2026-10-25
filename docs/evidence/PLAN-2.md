# PLAN-2 implementation evidence

Updated: 2026-10-25  
State: Local Supabase integration and exact-head CI policy verification pass; the staging schema is deployed, with CLI migration-history synchronization still open.

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

The local Supabase stack could not be started from this environment. Docker access returned a permission error for `npipe:////./pipe/dockerDesktopLinuxEngine`; `npm run supabase:start` remained blocked on that pipe and was stopped. Therefore `npm run supabase:reset` and `npm run test:policies` were not run locally. GitHub CI verification is recorded below.

Exact-head CI passed for PR #8 at commit `dbccd3d7facff55bfd333594d7165154fcd79103` on 2026-10-25. The `check` job passed. The `policies` job started the Supabase stack, reset the local database from migrations, exported local settings, and passed all 55 policy/repository tests. This verifies the migration and corrected adapter imports in CI despite the local Docker limitation above.

The connected staging project is `Tabang` (`fokgjznjfhhqstddkaes`, `ap-southeast-1`). Its pre-deploy migration history and application tables were empty. The three repository migrations were applied and verified: 11 public tables with RLS, 22 public policies, six Storage object policies, two private buckets, the role and incident RPCs, and six incident-transition seed rows. No Postgres errors were logged after application.

The migration connector recorded application-time versions `20261025154922`, `20261025154929`, and `20261025154932` with the checked-in file names. Those differ from the repository prefixes `20261025082906`, `20261025082912`, and `20261025083045`; use the supported Supabase CLI migration-repair workflow to align history, then confirm `npm run supabase:push:dry-run` is empty. The CLI currently has no access token or project link, so this final synchronization check remains open.

Post-deploy security advisories contain two INFO findings for `public.signals` and `public.api_clients`, which intentionally have no client policies and are server-only. Performance advisories contain 4 unindexed foreign keys, 13 auth RLS initplan warnings, 7 unused-index notices, and 2 multiple-permissive-policy warnings. These are recorded for follow-up review.

## Gates still open

1. Authenticate and link the local Supabase CLI to project `fokgjznjfhhqstddkaes`, then use the [supported migration repair command](https://supabase.com/docs/reference/cli/supabase-migration-repair): mark `20261025154922`, `20261025154929`, and `20261025154932` reverted; mark `20261025082906`, `20261025082912`, and `20261025083045` applied. Rerun `npm run supabase:push:dry-run` and confirm no migrations are pending.
2. Inventory Render database rows and uploaded files using authorized source credentials. No hosted credentials were present in this workspace, so data presence is still unknown. Export and rehearse import for any data/files found; retain backups outside Git.
3. Import and reconcile source records and private objects, then verify password reset and app/partner flows.
4. Complete user review and the maintenance-window cutover only after staging checks pass. Reconcile writes before any rollback after Supabase accepts production writes.
5. Remove the custom Render app auth, `/api/app/*`, disk file endpoints, `pg` app store/migration path, and Render database/disk configuration only after the replacement is verified. Preserve the Node host and `/api/v1` partner API.

The Supabase staging schema is deployed. No Render resource was changed, no source data or files were exported/imported, and no production cutover occurred. FEAT-002 remains the historical Render implementation record; PLAN-2 remains the approved target direction and supersedes its target-provider decision.
