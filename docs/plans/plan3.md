# Plan 3: Fix and deploy the Supabase integration

Created: 2026-10-25
Status: Schema deployed to staging; supported CLI migration-history repair and dry run remain pending
Target: Supabase project `Tabang` (`fokgjznjfhhqstddkaes`), Singapore (`ap-southeast-1`)

## Goal

Repair the migration and policy-test failures reported on PR #8, verify the full local Supabase policy suite and exact-head CI, then deploy the schema to staging. This plan does not authorize production deployment, Render data migration, or application traffic cutover.

## Changes

1. In the unapplied core schema migration, create `public.role_assignments` before `private.app_role()`, which reads it. If staging records the current migration as applied, preserve it and use a forward migration instead.
2. Point the policy tests at the actual exports: `server/supabaseStore.mjs` and `src/services/auth/authGateway.js`.
3. Run `npm run supabase:start`, `npm run supabase:reset`, `npm run test:policies`, then `npm run check`. Fix any follow-on failures and repeat until all pass.
4. Update PLAN-2 evidence with the actual verification results. Commit and push the fix to the existing PR #8 branch; wait for exact-head CI to pass.
5. Before remote DDL, confirm the connected project is the intended staging project, inspect its migration history, schema, logs, and Supabase security/performance advisories, and review `npm run supabase:push:dry-run` output.
6. Apply the reviewed migrations to staging and verify migration state, expected tables/functions, and advisories. Stop if the project ref is unavailable, the target is production, migration history is ambiguous, or the dry run contains unexpected changes.

## Acceptance

- Clean local database reset and policy suite pass against the real Supabase adapters.
- `npm run check` and exact-head PR CI pass.
- Staging records the intended migration and the post-deploy schema/advisory checks succeed.
- PLAN-2 evidence records real results; PR #8 contains the fix.

## Execution record

- `$env:CI=true; npm run check` passed locally: 24 unit files (241 tests) and 44 server tests passed, along with lint, secret scan, contrast, and production build.
- Exact-head CI passed on PR #8 at `dbccd3d7facff55bfd333594d7165154fcd79103`; the check job passed, Supabase reset succeeded, and all 55 policy/repository tests passed.
- Connected staging preflight found an active, empty `Tabang` project: no migration history or application tables, and no initial security or performance findings. The project was healthy in Singapore.
- Applied all three checked-in migrations through the Supabase connector. Verification found all 11 public tables with RLS enabled, 22 public policies, six Storage object policies, the `private.app_role()` and `public.claim_incident(uuid)` functions, two private buckets, and the six expected incident-transition rows. No Postgres errors appeared after deployment.
- The connector recorded the migrations under versions `20261025154922`, `20261025154929`, and `20261025154932`, while the repository files use `20261025082906`, `20261025082912`, and `20261025083045`. The migration names and SQL are present, but the version IDs need the supported `supabase migration repair` workflow before the CLI can safely report the repository as synchronized.
- `npm run supabase:push:dry-run` could not run because the local CLI has no access token and no linked project ref. Local Docker access is also blocked by named-pipe permissions. Post-deploy security advisories report the intended server-only `signals` and `api_clients` tables without client policies; performance advisories report 4 unindexed foreign keys, 13 auth RLS initplan warnings, 7 unused-index notices, and 2 multiple-permissive-policy warnings.

## Limits

No Render inventory/import, production migration, or traffic cutover is included. Those remain PLAN-2 gates. The staging schema is live; migration-history repair and a successful linked CLI dry run remain open before calling the deployment workflow fully synchronized.
