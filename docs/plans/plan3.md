# Plan 3: Fix and deploy the Supabase integration

Created: 2026-10-25
Status: Code and exact-head CI verified; staging deployment pending project connection
Target: Existing non-production Supabase staging project; project ref must be connected before deployment

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
- Exact-head CI passed on commit `a122c5ac567f6e079956d62a28fca79f2a4488f3`; Supabase reset succeeded and all 55 policy/repository tests passed.
- Local Docker access is blocked by named-pipe permissions. The Supabase connector currently exposes no projects, so staging deployment has not occurred.

## Limits

No Render inventory/import, production migration, or traffic cutover is included. Those remain PLAN-2 gates. The Supabase project list was empty when this plan was written, so no hosted resource has been changed.
