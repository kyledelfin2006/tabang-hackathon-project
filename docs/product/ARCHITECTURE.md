# Architecture: Tabang

Created: 2026-09-26T16:20:55+08:00
Updated: 2026-10-17T22:21:39+08:00
Revision: 2
Status: Approved
Len's chat approval: Approved by Len in chat on 2026-10-17 at about 22:21 +08:00: "alright i approve of the revisions, you may also execute the ingtegration yourself after dinng phase 1"
Previous revision: Revision 1, approved 2026-09-26, in Git at `d928c56` on `feat-001/integration`
Replaces: [../archive/final-architecture.md](../archive/final-architecture.md), [../archive/firebase-migration-note.md](../archive/firebase-migration-note.md), archived 2026-10-18

## What changed in Revision 2

- The backend provider changes from Firebase (Auth, Firestore, security rules) to Supabase (Auth, Postgres with row-level security, Storage).
- Cloudinary and the four upload-signing routes are removed; files live in private Supabase Storage buckets.
- The `firebase-admin` dependency (D-6) is withdrawn before it was ever installed.
- The single Node host (D-2), the partner API, the canonical signal, the partner projection (D-5), and the DOST seam are unchanged.

## Observed facts and assumptions

Observed on 2026-10-03 in the `Project_Tabang` worktrees:

- Len cannot access the account that owns the Firebase project, so rules, indexes, and configuration cannot be deployed or changed.
- FEAT-001 phases A1 (`d928c56`), A2 (`32d17bf`), and C1 (`81b1012`) are committed; A2 and C1 are not yet merged into `feat-001/integration`.
- Track B's phase B1 is uncommitted and stopped after three unsuccessful attempts at a Firestore rules expression-limit error.
- The client is a Vite and React 19 SPA using React Router 7 data routers.
- Firebase is imported in exactly nine source files: `src/config/firebase.js`, `src/services/auth/firebaseAuthGateway.js`, six repositories, and `src/services/uploads/cloudinaryUploader.js` (through the config module).
- Route components receive repositories and the auth gateway by injection, and tests use fakes of them.
- Pure domain modules import no framework: `incidentLifecycle.js`, `reportSchemas.js`, `profile.js`, `roles.js`, `dashboardMetrics.js`, `redact.js`.
- Report ids are generated on the client with `crypto.randomUUID()`.
- Docker 29.7.2 is installed on the dev machine; the Docker daemon was not running when checked.

Assumptions, not verified in this revision:

- The Supabase free plan limits (two projects, about 500 MB of database, 1 GB of file storage, pausing after about a week without activity) are as remembered and must be confirmed on the Supabase pricing page before go-live.
- Supabase's built-in email sender is restricted and rate limited, so password reset emails to real users need a custom SMTP provider (Q-5).
- The DOST Signal contract (payload, transport, authentication) is unknown.
- One server instance is enough for expected load; in-memory rate limiting is acceptable at that scale.

## Components, boundaries, and flows

```
                 one origin (Node host, D-2)
 Browser SPA ─── GET /, /assets/*, deep links ──► server/static.mjs (dist/ only)
     │
     ├── Supabase Auth (email and password) ─────────────┐
     ├── Supabase data API (row-level security,          ├─► Supabase project
     │     database functions)                           │    (Postgres, Auth, Storage)
     └── Supabase Storage (private buckets, signed links)┘         ▲
                                                                   │ secret key, server only
 Partner systems (DOST Signal, LGU tools)                          │
     ─── /api/v1/signals, /api/v1/incidents, ───► server/routes/*.mjs ─► server/store.mjs
         /api/v1/advisories (API key + scopes)        │
                                                      └─ server/integrations/dostSignal.mjs (adapter seam)
```

### Layers and dependency direction

- Domain (pure, shared by client and server): `src/services/incidents/incidentLifecycle.js`, `src/services/reports/reportSchemas.js`, `src/services/auth/profile.js`, `src/services/auth/roles.js`, `src/services/metrics/dashboardMetrics.js`, `src/services/observability/redact.js`, and the new `src/services/places/aklanPlaces.js`.
- These modules must not import Supabase, React, browser globals, or Node built-ins; a unit test enforces this by scanning their imports.
- Domain mappers such as `toIncident` and `toPersonalReport` accept plain values (strings, numbers, millisecond timestamps), never provider objects.
- Client use cases: `submitReport` and `replayQueuedReports` in `src/services/reports/`, depending only on injected repository, uploader, and queue objects.
- Client adapters: `src/config/supabase.js` creates the one browser client; `supabaseAuthGateway.js`, the repositories, and `storageUploader.js` receive it and translate rows to the plain shapes the domain expects.
- The gateway and repository method names are the ports; they stay as they are today so routes, components, and fakes do not change when the provider does.
- Server adapters: `server/http.mjs`, `server/auth.mjs` (partner API keys only), `server/supabaseAdmin.mjs` (creates the one server client), `server/store.mjs` (small functions the routes call), `server/routes/*.mjs`, `server/integrations/*.mjs`.
- `@supabase/supabase-js` may be imported only by `src/config/supabase.js` and `server/supabaseAdmin.mjs`; a test fails on any other import.
- Server routes depend on the domain modules and on `store.mjs`, so handlers are tested with an in-memory store.
- Database functions raise errors with stable codes (`not_found`, `forbidden`, `already_claimed`, `invalid_transition`, `not_cancellable`); adapters map the codes to plain-language copy and never show a provider message.

### Database schema

The schema lives in `supabase/migrations/*.sql`, and `supabase db reset` rebuilds it from nothing.
All tables have row-level security enabled.
Clients change state only where the table below says "direct"; every other change goes through a database function that checks the caller and writes atomically.

| Table | Replaces | Key columns | Client read | Client write |
|---|---|---|---|---|
| `profiles` | `users` | `id` (auth user), `display_name`, `email`, `phone`, `barangay` | owner, reviewer | created by a trigger at sign-up; owner updates name, phone, barangay directly |
| `role_assignments` | `roleAssignments`, custom claims | `user_id`, `role`, `assigned_by`, `assigned_at` | owner, reviewer | none; `decide_application` and `set_role` only |
| `reports` | `reports` | `id` (client uuid), `reporter_id`, `kind`, `municipality`, `barangay`, `landmark`, `latitude`, `longitude`, `description`, `contact_phone`, `severity`, `need`, `people_affected`, `image_paths`, `public_summary`, `priority`, `verification_status`, `incident_status`, `assigned_responder_ids`, `acknowledged_at`, `resolved_at`, `created_at`, `updated_at` | reporter, responder and above | direct insert of the reporter-supplied columns only; all later changes through functions |
| `report_events` | `reports/{id}/events` | `report_id`, `type`, `from_status`, `to_status`, `actor_id`, `actor_role`, `note`, `created_at` | reporter, responder and above | none; written by functions with server time |
| `incident_transitions` | the rules' `allowedNextStatuses` | `from_status`, `to_status` | everyone | none |
| `public_feed` | `publicFeed` | `id`, `kind`, `summary`, `municipality`, `barangay`, `source`, `signal_id`, `published`, `created_by`, `created_at`, `expires_at` | everyone, published and unexpired rows only; responders see their own | responders insert and update their own with `source = 'tabang'`; reviewers may unpublish any |
| `hotlines` | `hotlines` | `id`, `organization`, `coverage_area`, `phone_numbers`, `verified`, `verified_at`, `verified_by` | everyone | reviewer and above |
| `hotline_reviews` | `hotlines/{id}/reviews` | `hotline_id`, `reviewer_id`, `rating`, `comment`, `updated_at` | everyone | owner, one row per hotline |
| `hotline_directory` (view) | stored `ratingCount`, `ratingTotal` | hotline columns plus `rating_count`, `rating_total` computed from reviews | everyone | not writable |
| `responder_applications` | `responderApplications` | `applicant_id`, `organization`, `badge_number`, `municipality`, `identity_document_path`, `selfie_path`, `consent_version`, `status`, `submitted_at`, `reviewed_by`, `reviewed_at`, `review_notes` | owner, reviewer | `submit_application` and `decide_application` only |
| `signals` | `signals` | `source`, `external_id`, canonical signal fields | none | none; server only |
| `api_clients` | `apiClients` | `id`, `name`, `key_hash`, `scopes`, `status` | none | none; server only |

Field lengths, allowed values, and "both coordinates or neither" are table constraints, so they hold for every writer.
A client cannot choose `priority`, `verification_status`, `incident_status`, or assignment at creation because it has no insert privilege on those columns and they take their defaults.
The legacy `floodReports`, `helpRequests`, and `responders` collections are not recreated.

### Database functions

| Function | Caller | Effect |
|---|---|---|
| `claim_incident(report_id)` | responder and above | Assigns the caller to an unclaimed report, moves it to `acknowledged`, sets `acknowledged_at`, appends an event. |
| `transition_incident(report_id, to_status, note)` | assigned responder, or reviewer | Applies a move listed in `incident_transitions`, sets `resolved_at` on resolve, appends an event; from `new` it performs a claim. |
| `verify_incident(report_id, verification_status)` | assigned responder, or reviewer | Sets `verified` or `rejected`, appends an event. |
| `cancel_report(report_id)` | reporter | Cancels a report that is `new` or `acknowledged`. |
| `submit_application(...)` | signed-in user | Creates a pending application, or replaces the caller's rejected one. |
| `decide_application(applicant_id, approve, notes)` | reviewer, never for their own application | Records the decision, clears the evidence paths, and grants `responder` on approval, in one transaction. |
| `set_role(user_id, role)` | reviewer for `resident` and `responder`, admin for any role, never for oneself | Writes `role_assignments`. |
| `incident_counts()` | responder and above | Returns exact counts for the dashboard in one call. |
| `ingest_signal(...)` | server only | Upserts a signal by `source` and `external_id` and its `public_feed` item in one transaction. |

The transition table is deliberately held twice: in `incident_transitions` as the boundary and in `ALLOWED_TRANSITIONS` for client messages; a test compares the two.

### Authentication and roles

- Supabase Auth with email and password; no social login.
- Sign-up sends name, phone, and barangay as metadata; a database trigger validates them and creates the `profiles` row, so a profile exists even when the browser closes mid sign-up.
- Every new account is a resident; a missing `role_assignments` row means resident.
- `role_assignments` is the only role source; the custom-claim branch is removed.
- The session is built from one auth state subscription, with a sequence guard so a stale session build cannot overwrite a sign-out.
- Email confirmation is off during development (D-17, proposed) and is revisited with Q-5 before real users.

### File storage

| Bucket | Visibility | Object path | Upload | Read | Delete |
|---|---|---|---|---|---|
| `report-photos` | private | `{reporter_id}/{report_id}/{file}` | the reporter, into their own folder | the reporter, responder and above, through signed links that expire | reviewer and above |
| `identity-evidence` | private | `{applicant_id}/{file}` | the applicant, into their own folder | the applicant and reviewers, through signed links that expire | reviewers, after a decision |

Buckets enforce an image-only type list and a size limit.
The browser still validates, resizes, and strips metadata before upload, as it does today.
Evidence paths are derived from the applicant id, so a failed deletion can be retried by listing the applicant's folder.

### Trust boundaries

| Boundary | Enforced by |
|---|---|
| SPA data access | Row-level security policies, column privileges, table constraints, and database functions in `supabase/migrations` |
| Files | Storage policies on the two private buckets; signed links for viewing |
| Partner API | API key (random 32 bytes, stored as SHA-256 hash in `api_clients`), scope check, per-client rate limit |
| Server-only tables | `signals`, `api_clients`: no policies, so no client can read or write; only the server's secret key reaches them |
| Supabase secret key | Read from the environment only by `server/supabaseAdmin.mjs`; never in the SPA bundle, Git, logs, or evidence |
| Partner data exposure | A fixed projection in `server/routes/incidents.mjs` that cannot emit contact numbers, descriptions, coordinates, or reporter ids (D-5) |
| Static files | `server/static.mjs` serves only resolved paths inside `dist/` |
| Browser egress | The Content Security Policy allows `'self'` and the configured Supabase origin only |

### API conventions (REQ-032)

- Base path `/api/v1`; breaking changes require `/api/v2`.
- JSON only; request bodies up to 64 KB for `/signals`, 8 KB elsewhere.
- Errors: `{ "error": { "code": "invalid_request", "message": "...", "requestId": "..." } }` with codes `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `method_not_allowed`, `rate_limited`, `not_implemented`, `unavailable`, `internal`.
- Every response carries `X-Request-Id`; timestamps are ISO 8601 with offset.
- Lists use `limit` (1 to 100, default 25) and an opaque `cursor`; responses include `nextCursor` or `null`.
- Authentication: partners send `Authorization: Bearer tbk_<key>`; no endpoint accepts app-user tokens, because the SPA no longer calls the server for uploads.
- The contract lives in `docs/api/openapi.json` (OpenAPI 3.1, JSON so tests can parse it without a dependency).

### Endpoints

| Method and path | Auth and scope | Purpose |
|---|---|---|
| `GET /api/v1/health` | none | Liveness and version. |
| `GET /api/v1/advisories` | none, CORS `*` | Published advisories and active signals. |
| `GET /api/v1/incidents` | partner, `incidents:read` | Partner projection, `since`, `status`, `kind`, `municipality`, cursor. |
| `GET /api/v1/incidents/{id}` | partner, `incidents:read` | One incident in the partner projection. |
| `POST /api/v1/signals` | partner, `signals:write` | Canonical hazard signal ingest, idempotent by `source` and `externalId`. |
| `POST /api/v1/integrations/dost-signal` | partner, `signals:write` | DOST-shaped payload through the adapter; 501 until the contract is known. |

The `/api/uploads/*` routes and their planned `/api/v1/uploads/*` replacements are removed.

### Canonical signal (inbound)

```json
{
  "source": "dost-signal",
  "externalId": "TCWS-2026-KRISTINE-014",
  "type": "tropical-cyclone-wind-signal | rainfall-warning | flood-advisory | other",
  "level": "1",
  "headline": "Signal No. 2 raised over Aklan",
  "body": "optional, up to 2000 characters",
  "areas": [{ "municipality": "Kalibo", "barangay": "optional" }],
  "issuedAt": "2026-10-01T08:00:00+08:00",
  "expiresAt": "2026-10-02T08:00:00+08:00",
  "url": "optional https link to the official bulletin"
}
```

Municipality names are validated against `aklanPlaces.js`; unknown areas are rejected with `invalid_request`.
Each accepted signal is stored in `signals` under `source` and `externalId`, with one `public_feed` item with `kind: "advisory"`, `source`, `municipality`, `summary` from `headline`, and `expires_at`.

### Partner incident projection (outbound, D-5)

`id`, `kind`, `incidentStatus`, `verificationStatus`, `severity`, `need`, `peopleAffected`, `municipality`, `barangay`, `createdAt`, `updatedAt`, `acknowledgedAt`, `resolvedAt`.

### DOST Signal adapter seam (REQ-036)

- `server/integrations/dostSignal.mjs` exports `toCanonicalSignal(payload)` and `verifyRequest(headers, rawBody, secret)`.
- Until D-1's contract is known, `toCanonicalSignal` throws a typed "contract pending" error and the route returns 501.
- Outbound push to DOST (webhooks or an outbox) is deferred until the contract exists; partners pull from `GET /api/v1/incidents` with `since`.

### Local development and tests

- `npx supabase start` runs Postgres, Auth, and Storage in Docker on this machine (D-13); the SPA and the server point at it through `.env`.
- Policy tests in `tests/policies/` use `node --test` and the real client code against the local stack, signing in as a resident, responder, reviewer, admin, and anonymous visitor.
- Unit tests keep using fakes and never need Docker.
- No test touches a hosted Supabase project.

## Decisions and trade-offs

| ID | Decision | Alternatives rejected | Reason |
|---|---|---|---|
| D-2 | One Node host serves SPA and API. | Static hosting plus a separate API origin. | Unchanged from Revision 1. |
| D-6 | Withdrawn. | - | `firebase-admin` is no longer needed. |
| D-9 | Legacy URLs are 301s in the server. | HTML stubs. | Unchanged; implemented in A2. |
| D-10 | Supabase replaces Firebase for auth and data. | Recovering the Firebase account; PocketBase; Appwrite; Convex. | Len cannot access the Firebase account; Supabase has the closest match to rules-as-boundary and includes storage without billing. |
| D-11 | Files move to private Supabase Storage buckets; Cloudinary is removed. | Keep Cloudinary and the signing routes. | Removes a secret, a vendor, and four server routes; report photos stop being public. |
| D-12 | The SPA talks to Supabase directly; policies and database functions are the boundary. | Route all data through the Node API. | Same shape as today; the app keeps working for residents when the Node host is down. |
| D-13 | Policy tests run against a local Supabase stack in Docker. | A second hosted project. | No network, no shared state, keeps the free project allowance. |
| D-14 | FEAT-001 is revised in place; A1, A2, and C1 are kept; B1's Firestore rules work is parked on an archive branch. | A separate migration feature first. | One spec, and known rules bugs are not ported before being fixed. |
| D-15 | No data or account migration; the database starts empty. | Export from Firebase. | The Firebase project is inaccessible and the app is not live. |
| D-16 | Add `@supabase/supabase-js` (runtime) and `supabase` (dev, the CLI); remove `firebase`, `firebase-tools`, `@firebase/rules-unit-testing`. | Hand-written REST calls. | The official client covers auth, data, and storage; the CLI runs the local stack and migrations. |
| D-17 | Email confirmation is off during development. | Confirmation on now. | The built-in sender is restricted; revisit with Q-5 before real users. |
| D-18 | State changes with business rules are database functions, not client-side transactions. | Wide update policies. | Postgres cannot express "old row versus new row" in a policy as Firestore rules did; functions keep the check and the write atomic. |
| D-19 | Hotline rating aggregates are computed by a view. | Stored counters maintained by the client or a trigger. | Nothing to forge and nothing to keep in sync at this size. |
| - | Keep `node:http` with a small router. | Express or Fastify. | Unchanged. |
| - | OpenAPI as JSON, hand-written. | YAML plus a parser or a generator. | Unchanged. |
| - | In-memory rate limiting. | Database or Redis counters. | Unchanged. |
| - | Policy tests in Node through the real repositories. | pgTAP SQL tests. | REQ-005 needs the real client shape; no second test language. |

Failure modes considered:

- Free project paused after a week without activity: every data call fails until it is resumed from the dashboard; operations documents an external uptime check that calls `GET /api/v1/advisories`, which reads the database.
- Node host down: the partner API and the SPA shell are unavailable; a browser that already loaded the SPA can still reach Supabase.
- Secret key leaked: rotate it in the Supabase dashboard and on the host, and rotate partner API keys; the server logs only redacted data.
- A partner floods `/signals`: per-client rate limit and body size cap; idempotent upsert prevents duplicates.
- Evidence deletion fails after a decision: the decision stands, the reviewer sees "evidence deletion pending", and the folder can be deleted again.
- A migration is wrong: `supabase db reset` rebuilds the local database; hosted changes are only ever applied from committed migrations.
- DOST contract never arrives: the canonical endpoint remains usable by any partner who adopts it.
- The old Firebase project stays online with its old rules and cannot be changed; no build of this app points at it after the migration (Len action: try account recovery to delete it).

## Open questions and approval

- Q-1: Node host provider and domain.
- Q-2: DOST contact and contract.
- Q-4: Len creates the hosted Supabase project (Singapore region proposed) and supplies its URL and keys; needed before deployment, not before implementation.
- Q-5: SMTP provider for sign-up and password reset emails; needed before real users.
- Q-6: Whether the old Cloudinary assets and the old Firebase project can be deleted; Len action.

Approval: Revision 2, including D-15 to D-19, was approved by Len in chat on 2026-10-17 at about 22:21 +08:00.
Len decided D-10 to D-14 in chat on 2026-10-03.

## Council record

2026-09-26, Revision 1:

- Devil's advocate: an API built before the DOST contract may not fit it; mitigated by a canonical schema plus an adapter seam instead of guessing DOST's shape.
- Simplicity: no framework, no queue service, no outbound push until needed.
- Security and reliability: the static-file leak and rules gaps are fixed before any API is exposed; partner projection is fixed code, not configuration; keys are hashed and scoped.
- Architecture: pure domain modules are shared by client and server, and handlers depend on a store interface.

2026-10-03, Revision 2:

- Devil's advocate: the free project pauses when idle and its email sender is restricted, both of which bite a flood app at the worst time; recorded as failure modes and Q-5, to be closed before go-live.
- Simplicity: storage moves in with the database, which deletes Cloudinary, its secret, the signing module, and four routes; rating aggregates become a view.
- Security and reliability: every rule that was a Firestore rule must exist again as a policy, constraint, or function and be proven by a test that uses the real client; server-only tables have no policies at all.
- Architecture: the provider is confined to two files, the gateway and repository method names stay as the ports, and provider error text never crosses into the UI.
- Revisit when: DOST publishes a contract, traffic needs more than one server instance, the free plan limits are reached, or a data sharing agreement allows richer partner data.
