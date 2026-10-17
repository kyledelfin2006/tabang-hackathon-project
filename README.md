# Tabang

A flood reporting and response application for Aklan.
Residents report flooding and request help; responders claim and resolve incidents; reviewers approve who becomes a responder.
Partner systems such as DOST Signal can send hazard signals and read incidents through a versioned API.

Originally built for UPV KomsaiHack 2026 (7th of 25+ teams), then rebuilt as one React application on a Node host backed by Supabase.

## Quick start

You need Node 22.9 or later and Docker Desktop running.

```bash
npm ci
npm run db:start          # local Supabase in Docker; prints its URL and keys
cp .env.example .env      # fill in the four SUPABASE values from db:start
npm run dev               # the app at http://127.0.0.1:5173
```

Without the Supabase values the app still loads, and says that sign-in is unavailable instead of failing silently.
`npm run db:stop` stops the local stack.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server for the app |
| `npm run build` | Production build into `dist/`; refuses to build without the Supabase settings |
| `npm start` | The Node host: serves `dist/` and the `/api/v1` API on one port |
| `npm run check` | Lint, secret scan, colour contrast, unit tests, server tests, build |
| `npm run test:unit` | Component and service tests (no database) |
| `npm run test:server` | Server, redirect, and API tests (no database) |
| `npm run test:policies` | Database policy and adapter tests against the local stack |
| `npm run db:start`, `db:stop`, `db:reset` | Start, stop, or rebuild the local database from `supabase/migrations` |
| `npm run api-clients -- create/list/revoke` | Provision partner API keys |
| `npm run seed:hotlines` | Load `docs/hotline-seed.json` as unverified hotlines |
| `npm run scan:secrets` | Look for committed credentials |
| `npm run audit:deps` | Production dependency audit |

## How it fits together

- The browser talks to Supabase directly for sign-in, data, and files.
  Row-level security policies, column grants, and database functions in `supabase/migrations/` are the security boundary.
- `server/index.mjs` serves the built app and the partner API from one origin, and redirects every retired page URL.
- Routes are in `src/routes/`; all data access goes through repositories in `src/services/`.
  Only `src/config/supabase.js` and `server/supabaseAdmin.mjs` may import the Supabase SDK, and a test enforces it.

The full design is in `docs/product/ARCHITECTURE.md`; current work is in `HANDOFF.md`; the partner API is in `docs/api/`.

## Roles

| Role | Can do |
|---|---|
| Resident | Report flooding, request help, see and cancel their own reports, rate hotlines, apply to be a responder |
| Responder | Everything a resident can, plus claim, advance, and verify incidents and publish advisories |
| Reviewer | Everything a responder can, plus decide responder applications and maintain hotlines |
| Admin | Everything, plus grant the reviewer and admin roles |

Roles live in the `role_assignments` table, which no client can write directly.
`docs/operations.md` explains how to grant the first admin.

## Privacy

Contact numbers, descriptions, landmarks, exact locations, and photos are readable only by the reporter and by responders.
Photos and identity documents are in private storage and are opened only through links that expire within minutes; photos have their location metadata stripped before upload.
An ID and selfie are deleted as soon as an application is decided.
Partners receive incident type, status, place, and times only.

## Troubleshooting

- **Sign-in is unavailable on a deployed site**: the build had no `VITE_SUPABASE_*` values. See "Sign-in fails for everyone" in `docs/operations.md`.
- **`npm run db:start` fails**: Docker Desktop is not running.
- **A new responder still sees the resident app**: the role is read when the session is built; signing out and back in picks it up at once.
- **Every request fails after a quiet week**: a free Supabase project pauses when idle. Resume it in the Supabase dashboard; see "Keeping the project awake" in `docs/operations.md`.
