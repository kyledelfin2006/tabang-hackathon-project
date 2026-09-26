# FEAT-001: Stabilize core flows and open an integration API

Created: 2026-09-26T16:22:29+08:00
Updated: 2026-09-26T16:28:00+08:00
Revision: 1
Status: Approved

## Purpose and success

Tabang must work end to end for the people it exists for: an anonymous visitor in a flood, a resident filing a report, a responder handling it, and a reviewer approving responders.
It must also expose a stable, versioned API so existing public-sector systems, starting with DOST Signal, can send hazard signals to Tabang and read Tabang incidents.
Success means every requirement below passes its criterion in the stated environment, recorded in the FEAT-001 evidence files.

Source findings are the IDs in `../evidence/2026-09-26-project-review.md`, copied at gate G0 from the workspace-root `PROJECT_REVIEW_REPORT.md`.

## Scope and non-goals

In scope:

- Fixing the security, breakage, flow, UI, accessibility, and documentation findings listed in the requirements table.
- Replacing Firebase Hosting with one Node host that serves the SPA and the API from one origin.
- A versioned REST API (`/api/v1`) with integration-client authentication, an inbound signal endpoint, an outbound incident endpoint, and an adapter seam for DOST Signal.

Non-goals for this revision:

- A DOST-specific payload mapping or outbound push, until DOST confirms the contract (REQ-036 covers the seam only).
- Sharing contact numbers, descriptions, or precise coordinates with partners (needs a data sharing decision, D-5).
- Filipino or Aklanon localization.
- Browser push notifications or SMS.
- Moving the SPA's own data access behind the API; the SPA keeps using Firestore with rules as the boundary.
- Cleanup of the workspace-level agent toolkit folders outside `Project_Tabang` (Len action).

## User flows

### Anonymous visitor

1. Opens `/`.
2. Sees "Call for help" with the national emergency number 911 and a link to the public hotline directory.
3. Opens `/hotlines` without an account and taps a number to call.
4. If the directory is empty or fails to load, still sees 911 and the instruction to contact the barangay hall.

### Resident report

1. Signs in and opens "Report flood" or "Request help".
2. Chooses municipality and barangay from the Aklan list, optionally adds a landmark and GPS.
3. Adds optional photos and sends.
4. On success, sees the report in "My reports".
5. If photos fail to upload, can send the same report without photos in one action.
6. If sending fails for any other reason, the report stays queued on the phone, the screen shows hotline numbers, and the queue resends automatically when the app reopens or the connection returns.
7. Can see queued reports, send them now, or discard them.

### Responder

1. Signs in and lands on the responder dashboard with exact counts.
2. Opens the incident queue, pages through all open incidents, and claims one.
3. On the incident, sees photos, a map link, readable labels, and records status changes and verification.
4. Publishes or unpublishes a public advisory.
5. Can reach resident features from the responder workspace.

### Reviewer

1. Opens applications and sees the applicant's name and email.
2. Opens the ID and the selfie through signed links.
3. Writes notes and approves or rejects.
4. Sees an accurate outcome, including when evidence deletion needs a retry.

### Integration client (DOST Signal or another partner)

1. Receives an API key with scopes from a Tabang operator.
2. Sends hazard signals to `POST /api/v1/signals`; Tabang publishes them as advisories with source and expiry.
3. Reads incidents from `GET /api/v1/incidents` with cursor pagination, in a projection without personal data.

## Requirements and acceptance criteria

Track letters refer to the implementation plan: A platform and API, B data and rules, C UI.

| ID | Required behavior | Observable pass/fail criterion | Source | Track |
| --- | --- | --- | --- | --- |
| REQ-001 | The server exposes only build output and API routes. | With `npm run build` then `npm start`, `GET` of `/.env`, `/.git/config`, `/server.mjs`, `/package.json`, and `/%2e%2e/.env` each return 404 and never file contents; a server test asserts this. | S-01 | A |
| REQ-002 | A fresh clone installs, tests, and starts. | In a new worktree from the integration branch, `npm ci` and `npm run test:unit` pass, and the signing module is tracked by Git. | S-02, T-03 | A |
| REQ-003 | The local check works with a configured `.env`. | With a local untracked `.env` present, `npm run check` passes; committing a `.env` still fails the secret scan. | T-01 | A |
| REQ-004 | Unit tests are deterministic. | `npm run test:unit` passes in three consecutive full runs on the dev machine. | T-02 | A |
| REQ-005 | Rules tests use the real client document shape. | A rules test creates a report as a resident using `buildReportDocument`, then a responder claims it, and `npm run test:rules` passes. | F-10, T-05 | B |
| REQ-006 | Role grants are bounded. | Rules tests show a reviewer can grant only `responder` or `resident`, cannot write their own assignment, and only an admin can grant `reviewer` or `admin`. | S-03 | B |
| REQ-007 | Legacy collections are closed. | Rules tests show `floodReports`, `helpRequests`, and `responders` deny all client reads and writes. | S-04 | B |
| REQ-008 | Hotline rating aggregates cannot be forged. | Rules tests show an aggregate update fails unless the matching review is written in the same transaction and the total moves by at most 5 per rating. | S-05 | B |
| REQ-009 | Public and report documents are schema-checked. | Rules tests reject a `publicFeed` write with unknown fields or oversized text, a report with an invalid type or oversized field, a client-chosen `priority`, and a status change by a responder not assigned to the incident (reviewers excepted). | S-06 | B |
| REQ-010 | One origin serves the SPA and the API. | `npm run build` then `npm start` serves `/`, deep links, `/assets/*`, and `/api/v1/health` from one port with the security headers formerly in `firebase.json`; `firebase.json` has no `hosting` block. | A-01 | A |
| REQ-011 | Every retired URL still arrives somewhere useful. | Server tests show each legacy path in `docs/legacy-url-map.md` returns 301 to its replacement, including `/Hotline.html` to `/hotlines`, and the Google verification file returns 200. | A-02 | A |
| REQ-012 | The PWA manifest is valid and on-brand. | The built manifest's icon URL returns 200 and `theme_color` and `index.html` `theme-color` match the navy shell token. | U-01, U-02 | C |
| REQ-013 | Hotlines are public and never absent. | Signed out, `/hotlines` lists directory numbers; with an empty or failing directory it still shows 911 and barangay guidance; the landing page links to it. | F-01, F-02 | C |
| REQ-014 | Location works without GPS. | A report can be sent with municipality and barangay chosen from the Aklan list and no coordinates; GPS is optional; manual coordinate fields are gone; the list comes from the PSA PSGC source recorded in the evidence. | F-03 | B, C |
| REQ-015 | Photo upload failure does not block a report. | With the upload endpoint returning 503, the form offers "Send without photos" and one click files the report. | F-04 | B, C |
| REQ-016 | Queued reports are resent and visible. | A report that failed to send appears in a pending list, is sent automatically on app open or the `online` event, can be sent or discarded manually, and resending never creates a duplicate. | F-05 | B, C |
| REQ-017 | The send-failure screen shows numbers. | When a submission fails, the failure panel lists hotline numbers from the directory, or 911 when the directory is unavailable. | F-06 | C |
| REQ-018 | Advisories have an owner and one view. | A responder can publish and unpublish an advisory; published advisories and active signals appear on the resident home; the separate community page redirects to that view. | F-07 | B, C |
| REQ-019 | Report status is honest. | Responders can mark a report verified or rejected; "Cancel" appears only for `new` and `acknowledged` reports; a refused action shows a readable message. | F-08, F-09, F-14 | B, C |
| REQ-020 | Sign-in is stable. | Signing in from a deep link returns to that link without showing the login form again; signing out during session loading leaves the user signed out. | F-11, F-12 | B |
| REQ-021 | Residents can correct their profile. | The account page edits name, phone, and barangay, and the change persists after reload. | Privacy page | C |
| REQ-022 | Responders can claim and advance real reports. | In the emulator, a responder claims a resident-created report and advances it; acknowledging from the detail page claims it. | F-10, F-15 | B |
| REQ-023 | The queue shows every open incident and exact counts. | With 30 open incidents, the queue pages to all 30 and dashboard counts match Firestore count queries. | F-13 | B, C |
| REQ-024 | Incident detail is actionable. | The detail page shows report photos, a map link when coordinates exist, and human labels for depth, need, status, and role. | F-16 | B, C |
| REQ-025 | Roles can move between workspaces. | A responder can open resident features from the responder shell, and the resident shell shows a link to the responder workspace for responders. | F-17 | C |
| REQ-026 | Reviewers decide with evidence. | The review queue shows applicant name and email, opens ID and selfie through signed URLs, records notes, and reports "decision recorded, evidence deletion pending" when deletion fails. | F-20, F-21, F-22 | B, C |
| REQ-027 | Rejected applicants can reapply and errors are visible. | A rejected applicant can submit a new application; a failed load shows an error with retry instead of an empty form. | F-23 | B, C |
| REQ-028 | Users never see developer language or raw errors. | A test scans rendered routes for the strings in review section 5.1, and action failures show mapped messages instead of Firebase `error.message`. | 5.1 | B, C |
| REQ-029 | Pages are titled and structured. | Each route sets a unique `document.title`, has exactly one `h1` inside `main`, no skipped heading levels, and moves focus to the `h1` on navigation. | U-10, U-11 | C |
| REQ-030 | Form errors are findable. | After a failed submit, focus moves to an error summary linking each invalid field, and every error is referenced by its field's `aria-describedby`. | U-12 | C |
| REQ-031 | Fixed UI does not hide focus. | Tabbing through the report form never leaves the focused field under the bottom navigation, the navigation respects the safe-area inset, and the modal traps focus. | U-13, U-14 | C |
| REQ-032 | The API follows one versioned convention. | Every API route is under `/api/v1`, returns JSON errors as `{ "error": { "code", "message", "requestId" } }`, and appears in `docs/api/openapi.json`; a test fails when a route and the document disagree. | API | A |
| REQ-033 | Integration clients are authenticated, scoped, limited, and audited. | A provisioning script creates a client and prints its key once; only a SHA-256 hash is stored; a revoked or wrong-scope key gets 401 or 403; exceeding the rate limit gets 429; each request is logged with redaction. | API | A |
| REQ-034 | Partners can read incidents without personal data. | `GET /api/v1/incidents` with scope `incidents:read` returns id, kind, status, verification, severity or need, people affected, municipality, barangay, and timestamps, with cursor pagination and a `since` filter, and never contact numbers, descriptions, coordinates, or reporter ids. | API | A |
| REQ-035 | Partners can send hazard signals. | `POST /api/v1/signals` with scope `signals:write` validates the canonical schema, upserts by `source` and `externalId` so repeats do not duplicate, and publishes an advisory that stops showing after `expiresAt`. | API | A |
| REQ-036 | DOST Signal has an adapter seam. | `server/integrations/dostSignal.mjs` exports a mapping function to the canonical signal with fixture tests, and its route answers 501 "contract pending" until D-1 is confirmed. | API | A |
| REQ-037 | Dead code and stale files are gone. | The items listed in the plan's cleanup tasks no longer exist and lint, tests, and build still pass. | Sections 8, 10 | A, B, C |
| REQ-038 | Documentation matches the system. | README, operations, architecture, API, legacy URL map, and privacy page agree with the code; superseded documents are in `docs/archive/` with replacement links; `docs/SPEC_INDEX.md` and `HANDOFF.md` are current. | Section 9 | A, C |

## Data and interfaces

Architecture, API shapes, and collection changes are in `../product/ARCHITECTURE.md` Revision 1.
Cross-track function contracts are in `../plans/FEAT-001-implementation.md` section "Interface contracts".

New or changed Firestore data:

- `reports`: adds `municipality`, `barangay`, `landmark`, `imageUrls`, and an empty `assignedResponderIds` at creation; `preciseLocation` becomes optional.
- `publicFeed`: adds `source`, `municipality`, `expiresAt`, and `signalId` for signal-backed advisories.
- `signals/{source}__{externalId}`: server-only record of inbound hazard signals.
- `apiClients/{clientId}`: server-only integration client registry with hashed key, scopes, and status.

## Quality constraints

- No new dependency without Len's authorization; the plan requests exactly one (`firebase-admin`, server only).
- All API input is validated server-side; the SPA remains bound by Firestore rules.
- No secret values in Git, docs, logs, or evidence.
- Accessibility targets WCAG 2.2 AA for the flows above.
- Emulator results, browser results, and physical-device results are recorded separately; Len performs physical-device checks.

## Decisions and assumptions

Confirmed by Len in chat on 2026-09-26:

- D-1: DOST Signal integration is needed in both directions (inbound signals, outbound incidents).
- D-2: One Node host serves the SPA and the API; Firebase Hosting is dropped.
- D-3: Location uses a municipality and barangay picker with optional GPS.
- D-4: The offline queue is kept and replayed.

Approved by Len in chat on 2026-09-26 at about 16:27 +08:00:

- D-5: Partner incident data excludes contact numbers, descriptions, coordinates, and reporter ids until a data sharing agreement exists.
- D-6: Add `firebase-admin` as a server-only dependency for integration writes, token verification, and provisioning.
- D-7: Adopt the workspace `AGENTS.md` spec workflow for this repository and archive `AI_IMPLEMENTATION_PLAN.md`.
- D-8: Remove unused Firebase Storage rules, tests, and emulator config.
- D-9: Replace the 18 legacy HTML stubs with server-side 301 redirects.

Assumptions:

- "DOST Signal" is a DOST system (possibly carrying PAGASA tropical cyclone wind signals) whose API contract Tabang does not yet have.
- The PSA Philippine Standard Geographic Code publication is an acceptable source for Aklan barangays.
- The chosen Node host supports long-running processes and environment secrets.

## Open questions and readiness

- Q-1: Which Node host (for example Render, Railway, or Fly.io) and domain will be used? Needed before deployment, not before implementation.
- Q-2: Who at DOST supplies the Signal contract and credentials? Needed to finish REQ-036 beyond the seam.
- Q-3: Resolved; D-5 to D-9 approved.

Approval: Revision 1 approved by Len in chat on 2026-09-26 at about 16:27 +08:00: "Okay I approve".
