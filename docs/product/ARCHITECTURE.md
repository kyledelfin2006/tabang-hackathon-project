# Architecture: Tabang

Created: 2026-09-26T16:20:55+08:00
Updated: 2026-10-21T10:49:23+08:00
Revision: 3
Status: Approved
Len's chat approval: Approved by Len in chat on 2026-10-21 at about 10:49 +08:00: "Alright create a handoff for another AI coding agent to execute. Skip the mandatory hard stops but keep thre required commiting and testing phases"
Previous revision: Revision 2, approved 2026-10-17, in Git at `f8e08d8` on `feat-001/integration`
Replaces: [../archive/final-architecture.md](../archive/final-architecture.md), [../archive/firebase-migration-note.md](../archive/firebase-migration-note.md), archived 2026-10-18

## What changed in Revision 3

- Len decided on 2026-10-21 to move off Supabase entirely and run Tabang on Render.
- Supabase Auth, the Supabase data API, and Supabase Storage are replaced by one Render web service, one Render Postgres database, and a Render persistent disk.
- The browser no longer talks to a database provider; every data call goes to the Node server, which becomes the security boundary (D-20, reverses D-12).
- Sign-in is Tabang's own: email and password hashed with Node's built-in scrypt, and server-side sessions in an httpOnly cookie (D-21).
- Files are stored on the persistent disk and served by the server after an authorization check, without signed links (D-22).
- Password-reset email goes through an HTTP email API called with the built-in `fetch` (D-23).
- The only new dependency is `pg`, the Postgres driver; `@supabase/supabase-js` and the `supabase` CLI are removed (D-24).
- The partner API, its contract, the canonical signal, the partner projection (D-5), and the DOST seam are unchanged.

## Observed facts and assumptions

Observed on 2026-10-21:

- FEAT-001 plan phases 1 to 8 are committed on `feat-001/integration` (last commit `f8e08d8`) and pushed to `origin`; nothing is merged into `main`.
- `@supabase/supabase-js` is imported only by `src/config/supabase.js` and `server/supabaseAdmin.mjs`, and the gateway and repository method names are the ports that routes and fakes use.
- The SQL in `supabase/migrations/` depends on Supabase in three places: `auth.uid()` and `auth.users`, the `anon` and `authenticated` roles in grants and policies, and the `storage` schema.
- No live updates are used (FEAT-001 non-goal), so nothing depends on Supabase Realtime.
- Render's free tier, read on render.com/docs/free on 2026-10-21:
  - A free web service sleeps after 15 minutes without traffic and takes about a minute to wake.
  - A workspace gets 750 free instance hours a month.
  - A free web service has no persistent disk, so its files are lost on redeploy, restart, or sleep.
  - It cannot send outbound traffic on SMTP ports 25, 465, or 587.
  - A free Postgres database has 1 GB, no backups, and expires 30 days after creation, with a 14-day grace period before it is deleted.
  - One free database is allowed per workspace.
- Render's pricing page lists no object storage service and no authentication service.

Assumptions, not verified in this revision:

- No hosted Supabase project was ever created, so there is no data or account to migrate (D-15 continues).
- Render's paid web service, Postgres, and disk prices are confirmed by Len on render.com/pricing before launch.
- Render offers a Singapore region for web services and Postgres.
- Render takes daily snapshots of persistent disks, and paid Postgres plans include backups; both are confirmed before launch.
- One server instance is enough for expected load, so in-memory rate limiting stays acceptable; a persistent disk also limits the service to one instance.

## Deployment stages (D-25)

| Stage | Web service | Database | Files | Reset email |
|---|---|---|---|---|
| Demo, now | Render free | Render free Postgres, recreated before it expires | the service's own filesystem, lost on sleep, restart, or redeploy | HTTP email API if a key is set |
| Launch | Render paid instance | Render paid Postgres with backups | Render persistent disk | HTTP email API, required |

The code is the same in both stages; only `render.yaml` plan values and environment variables differ.
In the demo stage a missing photo or ID file is expected, and the app shows "Photo unavailable" instead of a broken image (FEAT-002/REQ-010).
The demo stage is not for real flood reports.

## Components, boundaries, and flows

```
                   one origin, one Render web service (D-2)
 Browser SPA ─── GET /, /assets/*, deep links ─────► server/static.mjs (dist/ only)
     │
     └── /api/app/* (session cookie) ──────────────► server/app/*.mjs ──┐
                                                                         ├─► server/db.mjs ─► Render Postgres
 Partner systems (DOST Signal, LGU tools)                                │
     ─── /api/v1/* (API key + scopes) ─────────────► server/routes/*.mjs ┘
                                                          │
                                                          ├─ server/files.mjs ─► persistent disk (UPLOAD_DIR)
                                                          ├─ server/email.mjs ─► HTTP email API
                                                          └─ server/integrations/dostSignal.mjs
```

### Layers and dependency direction

- Domain modules stay pure and shared by client and server: `incidentLifecycle.js`, `reportSchemas.js`, `profile.js`, `roles.js`, `dashboardMetrics.js`, `redact.js`, and `aklanPlaces.js`.
- Their purity test is unchanged.
- Client use cases (`submitReport`, `replayQueuedReports`) and their injected ports are unchanged.
- Client adapters become plain `fetch` calls:
  - `src/services/http/apiClient.js` sends JSON with credentials and maps the error envelope to the existing data errors.
  - The auth gateway, the repositories, and the uploader keep their method names and call `/api/app/*` through it.
  - `src/config/supabase.js`, `supabaseAuthGateway.js`, and `storageUploader.js` are replaced.
- Server adapters:
  - `server/db.mjs` creates the one `pg` pool and is the only module that imports `pg`; a test enforces this.
  - `server/sessions.mjs` handles password hashing, sessions, and cookies.
  - `server/files.mjs` reads and writes files under `UPLOAD_DIR` only.
  - `server/email.mjs` sends reset email.
  - `server/app/*.mjs` holds the app routes, each of which checks the session and role before calling the store.
  - `server/store.mjs` holds the queries, written on `db.mjs` in place of `supabaseAdmin.mjs`.
- Routes are tested with the in-memory store, as today, and the store is tested against local Postgres.
- Database functions keep raising stable error codes (`not_found`, `forbidden`, `already_claimed`, `invalid_transition`, `not_cancellable`, `invalid_request`); the server maps them to the error envelope and the client maps those to plain copy.

### Database schema

The schema lives in `db/migrations/*.sql`, applied in filename order and recorded in a `schema_migrations` table.
`npm run db:reset` rebuilds a local database from nothing, and `npm start` applies pending migrations before it listens (D-26).
The Revision 2 schema is carried over table by table, with these changes:

| Table | Change from Revision 2 |
|---|---|
| `users` | New: `id`, `email` (unique, lower-cased), `password_hash`, `created_at`. Replaces `auth.users`. |
| `sessions` | New: `token_hash` (SHA-256 of a random 32-byte token), `user_id`, `created_at`, `last_seen_at`, `expires_at`. |
| `password_resets` | New: `token_hash`, `user_id`, `expires_at`, `used_at`. |
| `profiles` | `id` references `users`; created in the same transaction as the user at sign-up, so the `handle_new_user` trigger is removed. |
| every other table | Unchanged columns and constraints; foreign keys to `auth.users` point to `users`. |
| `hotline_directory` | Unchanged view. |

Row-level security, column grants, and the `anon` and `authenticated` roles are removed (D-20).
Table constraints stay, so field lengths, allowed values, the 17 Aklan municipalities, and "both coordinates or neither" still hold for every writer.

### Database functions

The Revision 2 functions are kept with the same rules and error codes.
Each takes the acting user's id as its first argument (`p_actor`) instead of reading `auth.uid()`, and reads that user's role from `role_assignments` itself, so a caller cannot claim a role it does not hold.
`ingest_signal` and `incident_counts` are unchanged apart from that.
The transition table is still held twice, in `incident_transitions` and `ALLOWED_TRANSITIONS`, and a test compares them.

### Authentication and sessions (D-21)

- Email and password; no social login; email confirmation stays off (D-17).
- Passwords are at least 8 characters and stored only as scrypt hashes with a per-user random salt, using `node:crypto`.
- Sign-up validates name, phone, and barangay with the existing `validateProfileInput`, then creates the user, profile, and session in one transaction.
- A session token is 32 random bytes, sent in a cookie named `tabang_session` with `HttpOnly`, `Secure` (except on `http://127.0.0.1` in development), `SameSite=Lax`, and `Path=/`.
- Only the token's SHA-256 hash is stored.
- Sessions expire 30 days after sign-in; sign-out deletes the session row.
- The role is read from `role_assignments` on every request, so a granted or revoked role applies on the next request.
- `GET /api/app/session` returns the signed-in user's profile and role, or `null`; the client builds its session from it with the existing sequence guard.
- Failed sign-ins are limited per email and per address (proposed 10 in 15 minutes), in memory, like the partner rate limit.
- Wrong credentials and unknown emails get the same message and the same response time class (the hash is still computed for unknown emails).

Cross-site requests: every state-changing `/api/app` request must carry an `Origin` header equal to the app's origin and a JSON or image content type, otherwise the server answers 403 `forbidden`.
Together with `SameSite=Lax`, this is the CSRF defence; there are no CSRF tokens.

### Password reset (D-23)

- `POST /api/app/password-reset` answers the same for known and unknown emails.
- For a known email, it stores a hashed single-use token that expires in 30 minutes and emails a link to `/update-password?token=...`.
- `POST /api/app/password-reset/confirm` checks the token, sets the new password, marks the token used, and deletes all of that user's sessions.
- `server/email.mjs` sends through one HTTP email API with `fetch` (Resend proposed, Q-5), configured by `EMAIL_API_KEY` and `EMAIL_FROM`.
- Without `EMAIL_API_KEY`, the server prints the link to its console only when `NODE_ENV` is not `production`; in production it logs that email is not configured and sends nothing.

### File storage (D-22)

| Kind | Path under `UPLOAD_DIR` | Upload | Read | Delete |
|---|---|---|---|---|
| Report photo | `report-photos/{reporter_id}/{report_id}/{uuid}.{ext}` | the reporter, for their own report | the reporter, responder and above | reviewer and above |
| Identity evidence | `identity-evidence/{applicant_id}/{uuid}.{ext}` | the applicant | the applicant and reviewers | the server, right after a decision |

- Uploads are `POST` requests with the raw image as the body: JPEG, PNG, or WebP, at most 5 MB, as in Revision 2.
- The server checks the content type and the file's leading bytes, generates the file name itself, and never uses a client-supplied path.
- Reads go through `GET /api/app/files/{kind}/...`, which checks the session and the rule above, then streams the file with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- The browser sends the session cookie with `<img>` requests to the same origin, so no signed links are needed.
- Every resolved path must stay inside `UPLOAD_DIR`; anything else is 404.
- A file that is missing on disk answers 404, and the app shows "Photo unavailable".
- The browser still resizes images and strips their metadata before upload.
- Deleting evidence after a decision removes the applicant's folder; if that fails, the decision stands and the reviewer sees "evidence deletion pending", as in Revision 2.

### Trust boundaries

| Boundary | Enforced by |
|---|---|
| App data access | Session check and role check in every `server/app` route; database functions for state changes with business rules; table constraints |
| What each role sees | Fixed column lists in `server/store.mjs` queries; contact numbers, descriptions, landmarks, and coordinates only for the reporter and responders and above |
| Files | `server/files.mjs` path containment and the per-kind read rule |
| Sessions and passwords | Hashed tokens and scrypt hashes; `HttpOnly`, `Secure`, `SameSite=Lax` cookie; origin check on writes; sign-in limits |
| Partner API | Unchanged: hashed API keys, scopes, per-client rate limit |
| Server-only tables | `signals`, `api_clients`, `sessions`, `password_resets`, `users.password_hash`: never returned by any route |
| Database credentials | `DATABASE_URL` only in the server environment; never in the SPA bundle, Git, logs, or evidence |
| Partner data exposure | Unchanged fixed projection (D-5) |
| Static files | Unchanged: only resolved paths inside `dist/` |
| Browser egress | The Content Security Policy allows `'self'` only; images also allow `blob:` and `data:` for previews |

### App API (internal)

`/api/app/*` is for the Tabang SPA only, is not versioned, and is not in `docs/api/openapi.json`.
It uses the same error envelope, request ids, and cursor paging as `/api/v1`.

| Area | Routes |
|---|---|
| Session | `GET /api/app/session`, `POST /api/app/sign-up`, `POST /api/app/sign-in`, `POST /api/app/sign-out`, `PATCH /api/app/profile`, `POST /api/app/password-reset`, `POST /api/app/password-reset/confirm`, `POST /api/app/password` |
| Reports | `POST /api/app/reports`, `GET /api/app/reports/mine`, `POST /api/app/reports/{id}/cancel` |
| Incidents | `GET /api/app/incidents`, `GET /api/app/incidents/counts`, `GET /api/app/incidents/{id}`, `POST /api/app/incidents/{id}/claim`, `POST /api/app/incidents/{id}/transition`, `POST /api/app/incidents/{id}/verify` |
| Advisories | `GET /api/app/advisories/mine`, `POST /api/app/advisories`, `POST /api/app/advisories/{id}/unpublish` |
| Hotlines | `GET /api/app/hotlines`, `PUT /api/app/hotlines/{id}`, `PUT /api/app/hotlines/{id}/review` |
| Applications | `GET /api/app/applications/mine`, `POST /api/app/applications`, `GET /api/app/applications`, `POST /api/app/applications/{applicantId}/decision` |
| Files | `POST /api/app/files/report-photos/{reportId}`, `POST /api/app/files/identity-evidence`, `GET /api/app/files/...` |

The route list follows the existing repository methods one to one; the plan may adjust names without changing behavior.

### Partner API, canonical signal, projection, and DOST seam

Unchanged from Revision 2: base path `/api/v1`, the endpoints, the error codes, the canonical signal, the partner incident projection (D-5), the DOST adapter seam, and `docs/api/openapi.json`.
`GET /api/v1/health` additionally reports whether the database answers, returning 503 `unavailable` when it does not (FEAT-002/REQ-014).

### Hosting on Render

- `render.yaml` (a Render Blueprint) declares one Node web service and one Postgres database in the Singapore region.
- The web service builds with `npm ci && npm run build`, starts with `npm start`, and uses `/api/v1/health` as its health check.
- `DATABASE_URL` comes from the database's internal connection string.
- Launch adds a persistent disk mounted at the path in `UPLOAD_DIR` and switches both plans to paid.
- The app needs no build-time variables any more, because it calls its own origin.
- Free-stage sleeping: an external uptime check every 10 minutes keeps the service awake, using about 744 of the 750 free hours in a 31-day month; this leaves no hours for a second free service.

### Local development and tests

- `compose.yaml` runs the official `postgres:17` image in Docker on this machine; `npm run db:start`, `db:stop`, and `db:reset` wrap it and the migration runner.
- Unit tests keep using fakes and never need Docker.
- The FEAT-001 policy tests become integration tests in `tests/integration/`: they start the real server on a random port against local Postgres and a temporary `UPLOAD_DIR`, and drive it through the real client repositories with a cookie-keeping `fetch`.
- No test touches a hosted Render service or database.

## Decisions and trade-offs

| ID | Decision | Alternatives rejected | Reason |
|---|---|---|---|
| D-2 | One Node host serves SPA and API. | Static hosting plus a separate API origin. | Unchanged; on Render it is one web service. |
| D-9 | Legacy URLs are 301s in the server. | HTML stubs. | Unchanged. |
| D-10 | Superseded by D-20 to D-26. | - | Supabase is no longer used. |
| D-11 | Superseded by D-22. | - | - |
| D-12 | Reversed by D-20. | - | The browser has no database provider to talk to. |
| D-13 | Integration tests run against local Postgres in Docker. | A hosted test database. | Same reasons as before; the stack is now one container. |
| D-15 | No data or account migration; the database starts empty. | Export from Supabase. | No hosted Supabase project was created (assumption to confirm). |
| D-16 | Superseded by D-24. | - | - |
| D-17 | Email confirmation stays off. | Confirmation on now. | Revisit with Q-5 before real users. |
| D-18 | State changes with business rules stay database functions. | Rules only in server code. | Keeps each check and write atomic; the functions and their tests carry over. |
| D-19 | Hotline rating aggregates stay a view. | Stored counters. | Unchanged. |
| D-20 | The Node server is the only data boundary; the browser never reaches Postgres. | Keep row-level security with a per-request user setting. | Without Supabase's roles the server connects as the table owner, which bypasses column grants, and Render's role privileges are unverified; checks in one place, proven by integration tests, are simpler and honest. |
| D-21 | Own sign-in: scrypt hashes and hashed server-side sessions in an httpOnly cookie. | An auth library; an external auth provider. | Uses `node:crypto` only; Len chose this on 2026-10-21. |
| D-22 | Files on a Render persistent disk, served through an authorization check. | Bytes in Postgres; an S3-style store. | Standard library only; Len chose this on 2026-10-21; no signed-link machinery needed on one origin. |
| D-23 | Reset email through an HTTP email API with `fetch`. | SMTP; no email. | Works on any Render plan, including free, which blocks SMTP ports; no dependency; Len chose this on 2026-10-21. |
| D-24 | Add `pg` (runtime); remove `@supabase/supabase-js` and `supabase` (dev). | `postgres` (porsager); a query builder or ORM. | The most widely used Postgres driver; plain SQL keeps the migrations readable; Len authorized one driver on 2026-10-21. |
| D-25 | Build for the paid stage, demonstrate on the free stage. | Free only; paid from day one. | Len chose this on 2026-10-21. |
| D-26 | `npm start` applies pending migrations before listening. | Render's pre-deploy command; manual `psql`. | Works on the free plan, and one instance means no race between instances. |
| - | Keep `node:http` with a small router. | Express or Fastify. | Unchanged. |
| - | OpenAPI as JSON, hand-written, partner API only. | Documenting the app API too. | The app API is internal and changes with the SPA. |
| - | In-memory rate limiting. | Database or Redis counters. | One instance. |

Failure modes considered:

- Free service asleep: the first visit takes about a minute; the uptime check keeps it awake, and the offline queue keeps a resident's report until the server answers.
- Free database expires after 30 days: its data is deleted after the 14-day grace period; operations says to create the demo database again, or move to paid, before day 30.
- Free filesystem loses files: expected in the demo stage; records stay and the app shows "Photo unavailable".
- Server down: the whole app is unavailable, including the hotline directory; an already open app shows 911 and keeps queued reports (FEAT-001 behavior).
- Database credentials leaked: rotate the database password in Render, which updates `DATABASE_URL` for the linked service, and redeploy.
- Session token stolen: it is useless after sign-out or a password reset, and it expires after 30 days; cookies are never readable by scripts.
- Disk full: uploads fail with a plain message and "Send without photos" still works.
- A migration is wrong: the server refuses to start, so the previous deploy keeps serving; fix with a new migration.
- Partner flooding, evidence deletion failures, and the missing DOST contract: unchanged from Revision 2.

## Open questions and approval

- Q-1: Domain; the `onrender.com` address is used until one is chosen.
- Q-2: DOST contact and contract.
- Q-5: HTTP email provider (Resend proposed) and sender address; needed for real reset emails, not for implementation.
- Q-6: Whether the old Cloudinary assets and Firebase project can be deleted; Len action.
- Q-7: Len creates the Render account and workspace and applies the Blueprint; needed before deployment, not before implementation.
- Q-8: Paid plan choice and monthly cost before launch.

Approval: Revision 3, including the proposed D-20 and D-26, was approved by Len in chat on 2026-10-21 at about 10:49 +08:00.
Len decided the move to Render, the free-then-paid stages, the persistent disk, own sign-in with `pg`, and the HTTP email API in chat earlier on 2026-10-21.

## Council record

2026-09-26, Revision 1, and 2026-10-03, Revision 2: see Revision 2 in Git at `f8e08d8`.

2026-10-21, Revision 3:

- Devil's advocate: own sign-in is the riskiest code in the app; it is kept to `node:crypto` primitives, hashed tokens, no password or token in logs, and integration tests for every failure path, and an auth library remains the fallback if review finds it wanting.
- Devil's advocate: a single server is now a single point of failure for residents as well as partners; accepted at this scale, with the offline queue and 911 copy as the floor.
- Simplicity: one service, one database, one disk, one driver; same-origin cookies remove signed links and build-time configuration.
- Security and reliability: every rule that was a policy must exist again as a route check, query column list, constraint, or function, and be proven by an integration test through the real client.
- Architecture: the gateway and repository method names stay the ports, so routes, components, and fakes change little; `pg` is confined to one module.
- Revisit when: more than one instance is needed (sessions are already in Postgres, but files and rate limits are not), uploads outgrow a disk, or DOST publishes a contract.
