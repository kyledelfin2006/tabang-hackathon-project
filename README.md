# Tabang

A flood reporting and response application for Aklan. Residents report
flooding and request help; responders claim and resolve incidents; reviewers
approve who becomes a responder.

Originally built for UPV KomsaiHack 2026 (7th of 25+ teams) and since migrated
from a set of standalone HTML pages to a single React application.

## Quick start

```bash
npm install
cp .env.example .env      # fill in the VITE_FIREBASE_* values
npm run dev
```

`npm run dev` servesnp the app. Without Firebase values the app loads but shows
that sign-in is unavailable rather than failing silently.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build into `dist/` |
| `npm run check` | Lint, secret scan, unit tests, redirect tests, build |
| `npm run test:unit` | Component and service tests |
| `npm run test:rules` | Security rules against the Firebase emulator (needs Java) |
| `npm run test:redirects` | Every retired URL still reaches its replacement |
| `npm run scan:secrets` | Looks for committed credentials |
| `npm run audit:deps` | Production dependency audit |
| `npm run firebase:emulators` | Local Auth, Firestore, and Storage emulators |
| `npm run deploy:rules` | Deploys Firestore rules and indexes only |
| `npm start` | Runs `server.mjs`: static serving plus upload signing |

## Architecture

See `docs/final-architecture.md` for the full picture and the known
limitations. In short: routes in `src/routes/`, all Firebase access behind
repositories in `src/services/`, and `firebase/firestore.rules` as the
authorization boundary. Components never call Firestore directly.

## Roles

| Role | Can do |
|---|---|
| Resident | Report flooding, request help, see and cancel their own reports, rate hotlines |
| Responder | Everything a resident can, plus claim and progress incidents |
| Reviewer | Everything a responder can, plus approve responder applications and manage hotlines |
| Admin | Everything, plus delete role assignments |

Roles live in `roleAssignments/{uid}`, which **no client can write**. See
`docs/operations.md` for granting the first one.

## Privacy

Precise coordinates, contact numbers, and report descriptions are protected
fields, readable only by the reporter and responders handling the incident.
The public feed reads a separate `publicFeed` collection through a projection
that structurally cannot emit those fields. Report photos have their metadata
stripped before upload, because phone photos carry GPS coordinates.

Government ID and selfie evidence is deleted as soon as an application is
decided. Only the decision, the reviewer, and the timestamp are kept.

## Deployment

The SPA deploys to Firebase Hosting. `server.mjs` must run somewhere with
Node, because it holds the Cloudinary signing secret; without it, image upload
fails closed and text reports still work. Rules and indexes deploy separately
with `npm run deploy:rules`. See `docs/operations.md`.

## Troubleshooting

- **`firebase deploy` fails asking for Storage** — use `npm run deploy:rules`.
  Storage is not used and needs a paid plan to provision.
- **`/app/reports` errors in production** — the composite indexes are still
  building. Check the Firestore console.
- **The responder application screen does nothing after approval** — sign out
  and back in; the role is read when the session is established.
- **Image upload says uploads are unavailable** — `server.mjs` is not running
  or its Cloudinary environment values are missing. It fails closed on
  purpose rather than falling back to an unsigned upload.
