# Firebase security and migration note

Date: 2026-08-14

This note records the Phase 2 security model for Tabang. It is intentionally local-only planning and test coverage. No production rules, indexes, data migrations, or role assignments were executed in this phase.

## Trusted role model

Tabang should treat Firebase Auth custom claims as the trusted role boundary:

- `resident`: default authenticated resident account
- `responder`: approved field responder
- `reviewer`: authorized reviewer who can approve responder applications
- `admin`: full administrative reviewer access

Residents must never be able to grant themselves responder or reviewer privileges from the browser. The client should only ever create normal resident profiles and responder applications.

The approval flow should be:

1. Resident signs up as a standard authenticated user.
2. Resident submits `responderApplications/{uid}` plus identity evidence in Storage.
3. A reviewer or admin verifies the application in a trusted environment.
4. A trusted backend path such as the Firebase Admin SDK or a callable/review function sets the responder claim.
5. Only after the claim is set should the user gain responder-only Firestore and Storage access.

Until a trusted backend path exists, no browser client should be treated as authoritative for role assignment.

## Legacy-to-target collection mapping

| Current collection | Planned destination | Migration note |
|---|---|---|
| `users` | `users` | Keep resident profiles here. Preserve `role: resident` as a client-visible mirror only; the real authority becomes the Auth custom claim. |
| `responders` | `responderApplications` + Auth custom claims | Existing responder documents should be treated as legacy records. Approval should move to reviewer-managed applications plus trusted claims. |
| `floodReports` | `reports` with `kind: flood` | Move exact coordinates, phone numbers, and originals into protected report fields. |
| `helpRequests` | `reports` with `kind: help` | Same protection model as flood reports, with the request type stored in `kind`. |
| public/community feed reads from report collections | `publicFeed` | Do not expose raw reports publicly. Publish only sanitized summaries to a dedicated public collection. |

## Security shape introduced in this phase

- `firebase/firestore.rules` protects:
  - private `users` data
  - reviewer-managed `responders`
  - `responderApplications`
  - protected `reports`
  - append-only `reports/{reportId}/events`
  - public `publicFeed`
  - shared `hotlines` plus per-user reviews
  - legacy `floodReports` and `helpRequests` as a temporary protection layer during migration planning
- `firebase/storage.rules` protects:
  - responder application identity evidence
  - future report uploads
  - public feed assets
- `tests/rules/*` proves both allowed and denied access paths locally against emulators.

## Deployment order recommendation

Do not deploy these rules directly to production until the application flows match the collections and trusted approval path above.

Recommended order:

1. Finish authentication and profile migration in the SPA.
2. Build the trusted reviewer/admin path that assigns responder claims.
3. Rehearse data migration in the emulator with fixture data only.
4. Review privacy impact for community feed sanitization and report uploads.
5. Prepare a rollback plan and production verification checklist.
6. Ask for explicit approval before any production deploy or migration.

## Known compatibility warning

The current legacy HTML prototype still assumes direct writes to the `responders`, `floodReports`, and `helpRequests` collections. Those assumptions do not match the long-term trusted model and are one reason these rules were added only to source control in this phase rather than deployed.
