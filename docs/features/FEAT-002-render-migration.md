# FEAT-002: Move Tabang from Supabase to Render

Created: 2026-10-21T10:43:43+08:00
Updated: 2026-10-21T10:49:23+08:00
Revision: 1
Status: Approved
Len's chat approval: Approved by Len in chat on 2026-10-21 at about 10:49 +08:00: "Alright create a handoff for another AI coding agent to execute. Skip the mandatory hard stops but keep thre required commiting and testing phases"
Architecture: [../product/ARCHITECTURE.md](../product/ARCHITECTURE.md) Revision 3, approved

> **Supersession note (2026-10-25):** [PLAN-2](../plans/plan2.md) supersedes FEAT-002's Render target-provider decision and authorizes returning app authentication, data, and private files to Supabase. This document remains the historical record of the current Render implementation and its verification. The Render source is retained until PLAN-2 cutover acceptance.

## Purpose and success

Len decided on 2026-10-21 to run Tabang on Render instead of Supabase.
Residents, responders, reviewers, and partners must keep every behavior FEAT-001 delivered, while sign-in, data, and files move to one Render web service, one Render Postgres database, and a Render persistent disk.
Success means every requirement below passes its criterion in the stated environment, recorded in `docs/evidence/FEAT-002.md`, and no Supabase code or dependency remains.

## Scope and non-goals

In scope:

- Postgres schema and functions ported from `supabase/migrations` to `db/migrations`, without Supabase's `auth` and `storage` schemas.
- Tabang's own email and password sign-in, sessions, and password reset.
- An internal app API (`/api/app/*`) that the SPA uses for all data and files.
- File storage on a disk directory served by the server.
- Client adapters rewritten on `fetch`, keeping their method names.
- A Render Blueprint, migrations on start, and documentation for the free demo stage and the paid launch stage.

Non-goals:

- New user-facing features; FEAT-001's flows and copy stay as they are, except "Photo unavailable" (REQ-010).
- Migrating data or accounts (none exist, D-15).
- More than one server instance.
- Email confirmation, social login, and live updates.
- Closing FEAT-001's recorded gaps (REQ-014 barangay list, REQ-020, REQ-030, REQ-031 browser checks), which stay open under FEAT-001.
- Creating the Render account or choosing the email provider (Len actions Q-7 and Q-5).

## User flows

The FEAT-001 flows are unchanged for every user.
The differences a user can notice:

- Sign-in, sign-up, sign-out, and password reset behave as before, but the reset link opens `/update-password?token=...` and works once, within 30 minutes.
- After a password reset, every other signed-in device is signed out.
- A newly granted or revoked role applies on the next page load rather than within the hour.
- In the free demo stage, a photo or ID file may be missing after the server restarts; the record still opens and shows "Photo unavailable".
- In the free demo stage, the first visit after 15 minutes without traffic can take about a minute; a report sent meanwhile stays queued and resends.

Error states:

- Server unreachable or waking: the existing "can't reach Tabang" copy, the offline queue, and the 911 fallback.
- Too many failed sign-ins: "Too many attempts. Wait 15 minutes and try again."
- Expired or used reset link: "This link has expired. Ask for a new one." with a link to the reset form.
- Upload refused (type, size, or disk full): the existing upload error and "Send without photos".

## Requirements and acceptance criteria

| ID | Required behavior | Observable pass/fail criterion | Replaces |
|---|---|---|---|
| REQ-001 | The database is reproducible locally. | With Docker running, `npm run db:start` then `npm run db:reset` builds the full schema from `db/migrations` with no manual step, and `npm run test:integration` passes on the result. | FEAT-001/REQ-043 |
| REQ-002 | Migrations apply on start. | Against an empty database, `npm start` applies every migration, records each in `schema_migrations`, then listens; a second start applies none; a migration with an SQL error stops the start with a non-zero exit and a message naming the file, and records nothing for it. | - |
| REQ-003 | Accounts work on Tabang's own sign-in. | Against local Postgres: sign-up creates the user and a profile with name, phone, and barangay; invalid profile input is refused with the existing field messages; a new account is a resident; sign-in sets a `tabang_session` cookie with `HttpOnly`, `SameSite=Lax`, and `Path=/` (and `Secure` outside local development); sign-out deletes the session so the old cookie gets `null` from `GET /api/app/session`; an unknown email and a wrong password get the same message; the `users` table holds no plain password. | FEAT-001/REQ-041 |
| REQ-004 | Password reset works and cannot be abused. | Requesting a reset for a known and an unknown email returns the same response; for the known email the test email adapter receives one link; the link sets a new password once, signs out all of that user's sessions, and is refused on second use and after 30 minutes; without `EMAIL_API_KEY` and outside production the link is printed to the server console, and with `NODE_ENV=production` it is not. | FEAT-001/REQ-041 |
| REQ-005 | Sign-in is rate limited. | The 11th failed sign-in for one email, or from one address, within 15 minutes gets 429 with the plain message, and a correct password is also refused until the window passes. | - |
| REQ-006 | Roles are current. | After a reviewer approves an application, the applicant's next `GET /api/app/session` reports `responder`; after an admin sets them back to `resident`, their next incident request is refused with 403. | - |
| REQ-007 | Every FEAT-001 data rule holds through the server. | The scenarios of the FEAT-001 policy tests (accounts, reports, public feed, hotlines, applications, storage, repositories, transition parity, store, partner API) are ported to `tests/integration/` with the same expected outcomes, run through the real client repositories against the app API and local Postgres, and pass. | FEAT-001/REQ-005, and the mechanism behind REQ-006 to REQ-009, REQ-018, REQ-019, REQ-022, REQ-023, REQ-026, REQ-027 |
| REQ-008 | Cross-site writes are refused. | A state-changing `/api/app` request with a missing or foreign `Origin` header, or a content type other than JSON (or an image type on upload routes), gets 403 `forbidden` and changes nothing. | - |
| REQ-009 | Files are private. | Integration tests show: a signed-out visitor and an unrelated resident get 404 for a report photo and for identity evidence; the reporter and responders get the photo, and the applicant and reviewers get the evidence; a user cannot upload a photo to another user's report; a non-image, a file whose bytes do not match its type, and a file over 5 MB are refused; a path containing `..` or an encoded separator gets 404; after a decision the applicant's evidence files are gone from disk; every file response has `Cache-Control: private, no-store`. | FEAT-001/REQ-042 |
| REQ-010 | A missing file is shown honestly. | With a report photo's file deleted from disk, the incident and "My reports" still load and the photo slot shows "Photo unavailable" in jsdom tests. | - |
| REQ-011 | Providers are confined to adapters. | A test fails if `pg` is imported anywhere except `server/db.mjs`, if any file imports `@supabase/*`, or if a pure domain module imports React, browser globals, Node built-ins, or a provider. | FEAT-001/REQ-040 |
| REQ-012 | The browser talks only to its own origin. | `tests/server/securityHeaders.test.mjs` shows `connect-src 'self'` and `img-src 'self' blob: data:` with no other origin, and the built bundle contains no Supabase URL or key name. | FEAT-001/REQ-010 (CSP part) |
| REQ-013 | Render can deploy it from the repository. | `render.yaml` declares one Node web service (build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/v1/health`) and one Postgres database in Singapore, with `DATABASE_URL` from the database; `docs/operations.md` describes the free and paid stages; a real deploy by Len is recorded separately and stays pending until it happens. | - |
| REQ-014 | Health reflects the database. | `GET /api/v1/health` answers 200 when the database answers a query and 503 `unavailable` when it does not, with no database detail in the body. | - |
| REQ-015 | The partner API is unchanged. | All `tests/server` tests and the partner integration tests pass, and `docs/api/openapi.json` has no change in paths, parameters, or schemas. | - |
| REQ-016 | Supabase is gone. | `package.json` lists `pg` and no `@supabase/*` or `supabase` package; `supabase/` is removed; `git grep -i supabase` outside `docs/archive`, `docs/evidence`, and the specs that describe the migration finds nothing; `npm audit --omit=dev --audit-level=high` reports 0. | - |
| REQ-017 | Documentation matches Render. | `README.md`, `docs/operations.md`, and `.env.example` describe local Postgres, the Render Blueprint, `DATABASE_URL`, `UPLOAD_DIR`, the email keys, the first admin, backups with `pg_dump`, the 30-day free database expiry, and the move to paid; Supabase-specific operations text is archived. | FEAT-001/REQ-038 (operations part) |
| REQ-018 | Checks still pass. | `npm run check` passes, unit tests pass in three consecutive runs, and the server smoke test of FEAT-001 phase 8 gives the same answers on every route. | - |

## Data and interfaces

- Schema, functions, sessions, files, and the app API are defined in [../product/ARCHITECTURE.md](../product/ARCHITECTURE.md) Revision 3.
- New environment keys: `DATABASE_URL`, `UPLOAD_DIR`, `APP_ORIGIN`, `EMAIL_API_KEY`, `EMAIL_FROM`.
- Removed keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
- Kept keys: `HOST`, `PORT`, `API_RATE_LIMIT_PER_MINUTE`.
- The partner API contract `docs/api/openapi.json` does not change.

## Quality constraints

- FEAT-001's quality constraints apply: accessibility, plain-language errors, no secrets in Git or evidence, and separate records for local, hosted, browser, and device results.
- One new runtime dependency, `pg`, authorized by Len on 2026-10-21; no other dependency without new authorization.
- Passwords, session tokens, reset tokens, and `DATABASE_URL` never appear in logs, responses, evidence, or error messages.
- Every route keeps the 8 KB JSON body limit, except uploads (5 MB) and `/api/v1/signals` (64 KB).
- Local results, Render deploy results, browser results, and device results are recorded separately; Len performs the Render deploy and device checks.

## Decisions and assumptions

Confirmed by Len in chat on 2026-10-21:

- Render replaces Supabase for the database, sign-in, and files.
- Free stage for the demo now, paid at launch (D-25).
- Files on a Render persistent disk (D-22); in the free stage the same code writes to the service's filesystem, which does not persist.
- Own sign-in with `pg` as the only new dependency (D-21, D-24).
- Password-reset email through an HTTP email API (D-23).

Proposed in the draft and approved with this revision on 2026-10-21:

- The server is the only data boundary, without row-level security (D-20).
- Migrations run on `npm start` (D-26).
- A new FEAT-002 instead of a third FEAT-001 revision, because FEAT-001 is complete and its evidence refers to Supabase; FEAT-001 keeps a note that the listed requirements are replaced here.
- Work happens on branch `feat-002/render`, made from `feat-001/integration`.
- Sign-in limit of 10 failures per 15 minutes; session lifetime of 30 days; reset links valid for 30 minutes.
- Resend as the email provider adapter, pending Q-5.

Assumptions:

- No hosted Supabase project or data exists (D-15).
- Render's Singapore region, disk snapshots, and paid Postgres backups are as described in the architecture, to be confirmed before launch.

## Open questions and readiness

- Q-5: email provider and sender; not blocking implementation, because the adapter is tested with a fake.
- Q-7: Render account and Blueprint apply; blocks only the real deploy check in REQ-013.
- Q-8: paid plan choice and cost; blocks only launch.

Readiness: ready for implementation; Q-5, Q-7, and Q-8 do not block any plan phase.
Approval: Revision 1 was approved by Len in chat on 2026-10-21 at about 10:49 +08:00, together with Architecture Revision 3 and the FEAT-002 plan Revision 1.
