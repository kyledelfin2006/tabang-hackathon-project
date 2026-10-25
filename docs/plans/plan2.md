# Plan 2: Return Tabang to Supabase

Created: 2026-10-25  
Status: Approved for implementation  
Supersedes: The Render target decision in [FEAT-002](../features/FEAT-002-render-migration.md) and Architecture Revision 3's target-provider decision. FEAT-002 remains the record of the current Render implementation and its historical verification.  
Prerequisite: Complete or reconcile [Plan 1: Measured Codebase Pruning](plan1.md).

## Goal and target shape

Move Tabang's app authentication, application data, and private files from the current Render-owned implementation to Supabase while preserving existing user flows and the `/api/v1` partner API contract.

```text
React SPA ── Supabase Auth / Data API / private Storage
    │
    └── same-origin /api/v1 ── Node static + partner API server ── Supabase server adapter
```

Use Supabase Auth as the account/session provider, Postgres with RLS and database functions as the app data boundary, and private Storage buckets for report photos and identity evidence. Keep the Node server for static hosting and `/api/v1` partner routes, DOST integration, API-key checks, and rate limits. Keep the existing partner API paths, authentication contract, scopes, response shapes, and incident projection unchanged.

The app's client repository and auth gateway method contracts stay stable where practical. Pure domain modules remain provider-independent. Supabase SDK imports stay in the client provider adapter and server adapter; no service key or secret enters the Vite bundle.

## Decisions and interfaces

- **Auth:** Supabase Auth owns signup, sign-in, sign-out, sessions, password reset, and password changes. Keep the existing profile shape and role source (`role_assignments`); users cannot grant or change roles.
- **Existing passwords:** Current Render password hashes use Node `scrypt`. Preserve account IDs and profile/role data, but do not copy `scrypt` hashes into Supabase Auth. Require a Supabase password reset before returning users sign in. Supabase documents imported bcrypt and Argon2 formats; validate the final reset flow in staging ([Auth migration guidance](https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0)).
- **Profile creation:** Create the profile on Auth signup with a database trigger. Keep the trigger narrowly scoped, use a fixed safe `search_path`, schema-qualify references, and revoke direct execution from app roles. The trigger must not accept a role from user metadata.
- **Authorization:** Enable RLS on every Data API-exposed table and grant only the operations required by the client. Policies derive identity from `auth.uid()` and roles from trusted database state, never user-editable metadata. UPDATE access must check both the existing row and resulting row. Exposed views must use `security_invoker` where supported. Use `SECURITY INVOKER` for business functions; any unavoidable privileged helper belongs in a non-exposed schema, validates `auth.uid()`, and has narrowly granted execution.
- **Data/functions:** Rebuild the target schema from `db/migrations/` and the approved FEAT-001 Supabase behavior. Point profile and domain foreign keys at `auth.users`, remove the custom `users`, `sessions`, and `password_resets` implementation, and convert app actor checks to `auth.uid()`. Preserve domain constraints, stable error codes, audit behavior, transition rules, partner tables, and API projections.
- **Files:** Use private buckets for report photos and identity evidence. Preserve object ownership and authorization: a reporter can access their own report photos, authorized responders can read report photos, applicants can access their own evidence, and reviewers can access/delete evidence as required by the workflow. Enforce object type and size limits in Storage and retain client-side image preparation.
- **Runtime and configuration:** Restore `@supabase/supabase-js` as a pinned, lockfile-tracked dependency. Add the Supabase CLI as a pinned development tool. The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the Node process receives `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Keep `render.yaml`'s web service for the SPA and partner API; remove its Render database and disk resources after cutover. Remove `pg`, custom app sessions, `/api/app/*`, disk app-file routes, custom app database migrations/store code, and Render-only app email configuration only after their replacements pass.
- **Region:** Create the hosted Supabase project in Singapore, following the prior project proposal. Confirm plan limits, backup and recovery options, Auth email configuration, allowed redirect URLs, and production domain before go-live.

## Ordered implementation phases

### Phase 0: Protect and inspect the source

1. Confirm the current branch and working tree; preserve user changes and never read `.env` values into output.
2. Confirm whether a hosted Render database or upload directory contains data. Record counts and object inventory without exposing report content, contact details, credentials, or identity documents.
3. If data exists, take an access-controlled Postgres export and file backup. Verify both can be read; keep them outside Git. If source is empty, record the evidence and skip the data import only after that check.
4. Freeze schema changes in the source while the migration is rehearsed. Do not touch hosted resources until the local and staging phases pass.

### Phase 1: Restore the local Supabase foundation

1. Initialize `supabase/config.toml` and local development settings from the official CLI workflow. Configure local Auth redirect URLs and email confirmation to match the approved FEAT-001 behavior.
2. Add pinned SDK and CLI dependencies and environment validation. Ensure builds fail clearly when public Supabase configuration is missing, without logging keys.
3. Port the schema and functions to `supabase/migrations/`, preserving current Render business data shapes while restoring Supabase Auth references, RLS, grants, and Storage policy definitions.
4. Add private bucket definitions and bucket-level MIME/size limits. Add database tests for every exposed table, policy, view, function, and storage operation.
5. Run `supabase start`, `supabase db reset`, and the policy suite from a clean local state. Use `supabase migration new` for each new migration; do not hand-invent migration timestamps. Follow the [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

### Phase 2: Switch client adapters

1. Add the client Supabase adapter and replace the custom session gateway with Supabase Auth while preserving the current session shape and auth-provider loading/sequence behavior.
2. Update the existing repositories to use Supabase queries and RPCs while keeping their public methods and mapped domain values stable. Keep validation, offline queue behavior, report submission flow, redaction, lifecycle rules, and UI copy unchanged.
3. Replace the disk uploader with private Storage uploads and authorized downloads. Continue to offer “Send without photos” when an upload fails.
4. Update CSP and security headers to allow only the app origin plus the configured Supabase origin for the required data, auth, and storage requests.
5. Exercise resident, responder, and reviewer flows through the actual client repositories against local Supabase before removing the old `/api/app/*` callers.

### Phase 3: Reconnect the partner API

1. Replace only the partner server's database adapter with a server-only Supabase adapter. Preserve hashed partner API keys, scopes, rate limits, DOST normalization, response projection, and OpenAPI contract.
2. Keep privileged key use entirely inside the Node server. Never expose it to the SPA or return it in logs, errors, evidence, or responses.
3. Run the partner API suite against local Supabase and compare its OpenAPI document and representative responses to the current contract.

### Phase 4: Migrate data and files

1. Create the Supabase project in Singapore and push reviewed schema migrations to a staging project. Preview with `supabase db push --dry-run`; only the project owner applies hosted changes.
2. Rehearse importing Render data and files into staging. Import Auth users with preserved UUIDs and no old password hashes; import profiles, roles, and domain records in foreign-key order. Send/reset credentials through Supabase Auth rather than the old password column.
3. Copy files into private buckets with stable paths and matching record ownership. Validate object counts, sizes, MIME types, and access policies without opening private objects publicly.
4. Compare source and target row counts, key relationships, enum/status totals, audit records, role totals, and object inventories. Run application and partner smoke checks against staging.

### Phase 5: Cut over and remove replaced code

1. Schedule a maintenance window, stop source writes, take a final source backup, and repeat the import delta from that snapshot.
2. Deploy the SPA and Node partner server with Supabase public configuration and server-only secret configuration. Confirm Auth redirect/email settings and production CSP.
3. Verify signup, password reset, role gates, report submissions, offline replay, incident transitions, photo/evidence privacy, health endpoint, DOST signal ingestion, and partner incident reads.
4. Keep the Render source backup and previous deployment available through verification. Roll back before allowing Supabase writes if checks fail. After writes begin, use forward repair or reconcile new writes before any rollback.
5. Once replacement checks pass, remove the custom app auth/session and password-reset implementation, `/api/app/*`, app disk-file routes and storage implementation, `pg` and the custom app migration/store path, Render database/disk configuration, and Render-only operational instructions. Preserve the Node host, static serving, and partner API.
6. Update `.env.example`, `render.yaml`, `docs/operations.md`, architecture, handoff, feature status, and evidence. Mark FEAT-002 historical for the current implementation and this plan as the approved target migration record.

## Acceptance and verification

- `supabase db reset` creates the full local schema from committed migrations with no manual SQL. The migration list is in sync locally.
- Policy tests cover signed-out, resident, responder, reviewer, and admin access for select/insert/update/delete, RPC calls, and Storage read/write/delete; denied operations leave no changes.
- Signup creates one profile with validated user fields and a resident role. Users cannot assign roles through signup metadata or direct table writes. Password reset does not reveal whether an email exists.
- Repository tests cover reports, offline replay, incidents, advisories, hotlines, applications, and profile mapping with actual Supabase behavior.
- Storage tests show unauthorized users cannot access report photos or identity evidence; authorized roles can access only their permitted objects; oversized and unsupported files are rejected.
- Partner tests retain existing API-key auth, scopes, rate limits, OpenAPI contract, signal normalization, and incident projections.
- Build output contains the configured publishable key only; no service/secret key, Render database URL, or private personal data appears in the bundle or logs.
- Staging reconciliation has matching source/target counts and relationships, file inventory and access checks pass, password-reset instructions are verified, and a source backup is retained before production cutover.

## Exclusions

- No new user-facing feature, route, role, partner endpoint, or live-update behavior.
- No Edge Function rewrite of the partner API.
- No broad redesign of domain modules or repositories; keep edits to provider boundaries and required policy enforcement.
- No hosted cutover, deletion of the Render source, or removal of backups before staging acceptance and user review.
