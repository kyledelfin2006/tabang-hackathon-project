# Plan 1: Measured Codebase Pruning

Created: 2026-10-25  
Status: Approved for implementation  
Follow-up: [Plan 2: Return Tabang to Supabase](plan2.md)

## Goal

Remove code only when repository evidence shows it is unused or when Plan 2 has replaced its responsibility. Preserve Tabang's resident, responder, reviewer, and partner behavior. This plan has no line-count target.

## Current baseline

The current codebase is a React/Vite SPA and a Node server configured for Render Postgres. The server owns app sessions, app data routes, disk files, and the versioned partner API; the hosted Render deploy is pending in the handoff. `src/services/` contains the client repositories and shared domain logic. `db/migrations/` is the current plain-Postgres schema. Tests are split between `src/test/`, `tests/server/`, and `tests/integration/`.

The following Render app responsibilities are planned replacements, not immediate deletion candidates: custom sessions and password reset, `/api/app/*`, the custom Postgres app store and migration runner, and disk-backed app files. Plan 2 removes them only after the equivalent Supabase path passes its acceptance checks. The Node static server, `/api/v1` partner routes, API-client administration, DOST adapter, and their tests remain in scope for preservation.

## Ordered work

### Phase 1: Establish the baseline

1. Confirm the working tree, branch, and local configuration without printing secret values.
2. Record current build, lint, unit, server, integration, contrast, and secret-scan results where their prerequisites are available.
3. Inventory runtime and test imports, npm dependencies, package scripts, environment keys, routes, assets, redirects, and documentation links.
4. Trace each apparent dead file or duplicate responsibility to its callers, tests, and externally visible routes. Mark each candidate as `remove`, `keep`, or `recheck during Plan 2`, with evidence.

### Phase 2: Remove only proven dead code

1. Delete only files with no runtime, build, test, migration, deployment, or documented operational consumer.
2. Remove a dependency or script only after every import and invocation is gone and the lockfile is updated.
3. Keep legacy URL redirects while their documented mappings remain supported; keep historical specs and evidence in the archive.
4. Keep tests for required behavior. Rewrite tests only when the implementation boundary changes; do not reduce coverage to make cleanup easier.
5. Make no user-visible behavior, API contract, database policy, or authorization change as part of this cleanup phase.

### Phase 3: Record migration-enabled cuts

1. Maintain a separate replacement list for code Plan 2 will retire: custom app sessions/auth, app-only routes, disk upload and file-serving paths, Render app database/migration infrastructure, and Render database/disk configuration.
2. Before each deletion, link the passing replacement check from Plan 2 and search for remaining callers.
3. Keep shared server code until partner API usage is separated and verified. In particular, review `server/store.mjs` by caller before removing any query or helper.
4. Update the package scripts, environment example, operations guide, and tests in the same phase as the corresponding runtime removal.

### Phase 4: Close the pruning record

Record removed paths and dependencies, retained candidates with reasons, verification commands and results, and unresolved items in the handoff. Stop when no removal has evidence of a consumer-free or replaced responsibility; do not invent additional abstractions or cleanup work.

## Acceptance

- Every deleted runtime file has no remaining callers, and every removed dependency has no remaining import or script use.
- Resident, responder, reviewer, hotline, offline submission, accessibility, and partner API behavior remains covered by passing checks.
- The versioned partner API contract and legacy URL map have no unintended changes.
- No secret values are copied to documentation, logs, evidence, or Git.
- The final cleanup record explains every deletion and any candidate deliberately retained.

## Guardrails

- Plan 2 owns the provider migration; Plan 1 must not partially switch app data access.
- No package is added solely to measure code size or discover imports.
- Historical evidence remains historical and is not rewritten to imply that old checks exercised the new Supabase path.
