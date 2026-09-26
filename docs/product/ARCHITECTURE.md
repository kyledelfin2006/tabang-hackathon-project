# Architecture: Tabang

Created: 2026-09-26T16:20:55+08:00
Updated: 2026-09-26T16:28:00+08:00
Revision: 1
Status: Approved
Replaces on approval: `../final-architecture.md`, `../firebase-migration-note.md`

## Observed facts and assumptions

Observed on 2026-09-26 in `Project_Tabang` at commit `80a51de`:

- The client is a Vite and React 19 SPA using React Router 7 data routers and the Firebase 12 web SDK.
- Firestore rules are the authorization boundary for the SPA; `npm run test:rules` passes 29 of 29 in the emulator.
- A responder claim on a report created with the real client shape is denied by the rules (emulator probe, 16:18 +08:00).
- `server.mjs` holds the Cloudinary secret, signs uploads, and also serves every file in the project root, including `.env`.
- Firebase Hosting serves `dist/` only and has no route to the Node server, so uploads cannot work in the documented deployment.
- Pure domain modules exist and import no framework: `incidentLifecycle.js`, `reportSchemas.js`, `profile.js`, `roles.js`, `dashboardMetrics.js`, `redact.js`.
- The project runs on the Firebase free plan; Firebase Storage is not enabled; uploads go to Cloudinary.

Assumptions:

- The DOST Signal contract (payload, transport, authentication) is unknown.
- One server instance is enough for expected load; in-memory rate limiting is acceptable at that scale.

## Components, boundaries, and flows

```
                 one origin (Node host, D-2)
 Browser SPA ─── GET /, /assets/*, deep links ──► server/static.mjs (dist/ only)
     │       ─── /api/v1/uploads/* (Firebase ID token) ─► server/routes/uploads.mjs ─► Cloudinary
     │
     └── Firestore web SDK (rules enforce access) ──► Firestore
                                                        ▲
 Partner systems (DOST Signal, LGU tools)               │ Admin SDK (D-6)
     ─── /api/v1/signals, /api/v1/incidents, ───► server/routes/*.mjs ──┘
         /api/v1/advisories (API key + scopes)        │
                                                      └─ server/integrations/dostSignal.mjs (adapter seam)
```

### Layers and dependency direction

- Domain (pure, shared by client and server): `src/services/incidents/incidentLifecycle.js`, `src/services/reports/reportSchemas.js`, `src/services/auth/profile.js`, `src/services/auth/roles.js`, `src/services/metrics/dashboardMetrics.js`, `src/services/observability/redact.js`, and the new `src/services/places/aklanPlaces.js`.
- These modules must not import Firebase, React, browser globals, or Node built-ins; a unit test enforces this by scanning their imports.
- Client adapters: repositories in `src/services/**` wrap the Firestore SDK; route components receive repositories by injection for tests.
- Client use cases: `submitReport` and `replayQueuedReports` move out of the report page into `src/services/reports/` so the page only renders state.
- Server adapters: `server/http.mjs` (routing, JSON, errors, request ids), `server/auth.mjs` (Firebase ID tokens for app users, API keys for partners), `server/store.mjs` (Admin SDK Firestore access behind small functions the routes call), `server/routes/*.mjs`, `server/integrations/*.mjs`.
- Server routes depend on the domain modules and on `store.mjs`, never on `firebase-admin` directly, so handlers are tested with an in-memory store.

### Trust boundaries

| Boundary | Enforced by |
|---|---|
| SPA data access | Firestore rules (`firebase/firestore.rules`) |
| Upload signing and identity evidence | Firebase ID token verified by the server; role read from `roleAssignments` |
| Partner API | API key (random 32 bytes, stored as SHA-256 hash in `apiClients`), scope check, per-client rate limit |
| Server-only collections | `signals`, `apiClients`: the rules default-deny all client access; only the Admin SDK writes them |
| Partner data exposure | A fixed projection in `server/routes/incidents.mjs` that cannot emit contact numbers, descriptions, coordinates, or reporter ids (D-5) |
| Static files | `server/static.mjs` serves only resolved paths inside `dist/` |

### API conventions (REQ-032)

- Base path `/api/v1`; breaking changes require `/api/v2`.
- JSON only; request bodies up to 64 KB for `/signals`, 8 KB elsewhere.
- Errors: `{ "error": { "code": "invalid_request", "message": "...", "requestId": "..." } }` with codes `invalid_request`, `unauthorized`, `forbidden`, `not_found`, `method_not_allowed`, `rate_limited`, `not_implemented`, `unavailable`, `internal`.
- Every response carries `X-Request-Id`; timestamps are ISO 8601 with offset.
- Lists use `limit` (1 to 100, default 25) and an opaque `cursor`; responses include `nextCursor` or `null`.
- Authentication: app users send `Authorization: Bearer <Firebase ID token>`; partners send `Authorization: Bearer tbk_<key>`.
- The contract lives in `docs/api/openapi.json` (OpenAPI 3.1, JSON so tests can parse it without a dependency).

### Endpoints

| Method and path | Auth and scope | Purpose |
|---|---|---|
| `GET /api/v1/health` | none | Liveness and version. |
| `POST /api/v1/uploads/report-signature` | app user | Cloudinary signature for report photos (was `/api/uploads/cloudinary-signature`). |
| `POST /api/v1/uploads/identity-signature` | app user | Signature for ID and selfie uploads. |
| `POST /api/v1/uploads/identity-view` | app user, owner or reviewer | Signed delivery URL for evidence. |
| `POST /api/v1/uploads/identity-delete` | app user, reviewer | Deletes evidence after a decision. |
| `GET /api/v1/advisories` | none, CORS `*` | Published advisories and active signals. |
| `GET /api/v1/incidents` | partner, `incidents:read` | Partner projection, `since`, `status`, `kind`, `municipality`, cursor. |
| `GET /api/v1/incidents/{id}` | partner, `incidents:read` | One incident in the partner projection. |
| `POST /api/v1/signals` | partner, `signals:write` | Canonical hazard signal ingest, idempotent by `source` and `externalId`. |
| `POST /api/v1/integrations/dost-signal` | partner, `signals:write` | DOST-shaped payload through the adapter; 501 until the contract is known. |

Legacy `/api/uploads/*` paths remain as aliases until the SPA switches, then are removed within FEAT-001.

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
Each accepted signal writes `signals/{source}__{externalId}` and one `publicFeed` item with `kind: "advisory"`, `source`, `municipality`, `summary` from `headline`, and `expiresAt`.

### Partner incident projection (outbound, D-5)

`id`, `kind`, `incidentStatus`, `verificationStatus`, `severity`, `need`, `peopleAffected`, `municipality`, `barangay`, `createdAt`, `updatedAt`, `acknowledgedAt`, `resolvedAt`.

### DOST Signal adapter seam (REQ-036)

- `server/integrations/dostSignal.mjs` exports `toCanonicalSignal(payload)` and `verifyRequest(headers, rawBody, secret)`.
- Until D-1's contract is known, `toCanonicalSignal` throws a typed "contract pending" error and the route returns 501.
- Outbound push to DOST (webhooks or an outbox) is deferred until the contract exists; partners pull from `GET /api/v1/incidents` with `since`.

## Decisions and trade-offs

| ID | Decision | Alternatives rejected | Reason |
|---|---|---|---|
| D-2 | One Node host serves SPA and API. | Firebase Hosting plus Cloud Functions (needs billing); Hosting plus a separate API origin (CORS, wider CSP). | Chosen by Len; one origin keeps `connect-src 'self'` and removes the Hosting rewrite gap. |
| D-6 | `firebase-admin` on the server only. | A dedicated Firebase Auth "integration user" writing through rules. | Partners are not Firebase users; Admin SDK gives local ID token verification and server-only collections. Needs Len's dependency approval. |
| D-9 | Legacy URLs become 301s in the server. | Keep 18 HTML stubs and copy them into `public/`. | Fewer files; the hotline stubs are unnecessary once `/hotlines` is public. |
| - | Keep `node:http` with a small router. | Express or Fastify. | No new dependency; about ten routes. |
| - | OpenAPI as JSON, hand-written. | YAML plus a parser or a generator. | No dependency; a test keeps it in sync with the router. |
| - | In-memory rate limiting. | Firestore or Redis counters. | Single instance; documented limitation; revisit when scaling out. |
| - | Signals published through `publicFeed`. | A separate client-readable `signals` feed. | One advisory view for residents; the raw signal stays server-only. |

Failure modes considered:

- Node host down: the SPA and API are both unavailable; Firestore data is intact; operations documents a restart and an uptime check.
- Admin credentials leaked: rotate the service account key and API keys; the server logs only redacted data.
- A partner floods `/signals`: per-client rate limit and body size cap; idempotent upsert prevents duplicates.
- DOST contract never arrives: the canonical endpoint remains usable by any partner who adopts it.

## Open questions and approval

- Node host provider and domain (Q-1).
- DOST contact and contract (Q-2).
- D-5 to D-9 (Q-3).

Approval: Revision 1 approved by Len in chat on 2026-09-26 at about 16:27 +08:00: "Okay I approve".

## Council record (2026-09-26)

- Devil's advocate: an API built before the DOST contract may not fit it; mitigated by a canonical schema plus an adapter seam instead of guessing DOST's shape.
- Simplicity: no framework, no queue service, no outbound push until needed; one new dependency only.
- Security and reliability: the static-file leak and rules gaps are fixed before any API is exposed; partner projection is fixed code, not configuration; keys are hashed and scoped.
- Architecture: pure domain modules are shared by client and server, handlers depend on a store interface, and the transition table is tested for parity with the rules.
- Revisit when: DOST publishes a contract, traffic needs more than one server instance, or a data sharing agreement allows richer partner data.
