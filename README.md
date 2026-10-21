# Tabang

A flood reporting and response application for Aklan.
Residents report flooding and request help; responders claim and resolve incidents; reviewers approve who becomes a responder.
Partner systems such as DOST Signal can send hazard signals and read incidents through a versioned API.

Originally built for UPV KomsaiHack 2026 (7th of 25+ teams), then rebuilt as one React application on a Node host backed by PostgreSQL on Render.

## Quick start

You need Node 22.9 or later and Docker Desktop running.

```bash
npm ci
npm run db:start          # starts local PostgreSQL 17 container in Docker on port 54329
cp .env.example .env      # copies default configuration for local development
npm run db:migrate        # applies database migrations to local PostgreSQL
npm run dev               # starts Vite development server at http://127.0.0.1:5173
```

To run the unified production server locally:

```bash
npm run build             # builds client production bundle into dist/
npm start                 # runs pending migrations, then starts server at http://127.0.0.1:8000
```

`npm run db:stop` stops the local database container.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server for the React client |
| `npm run build` | Production build into `dist/` |
| `npm start` | Applies database migrations and starts the unified Node production server |
| `npm run check` | Runs lint, secret scan, colour contrast, unit tests, server tests, and build |
| `npm run test:unit` | Component and service unit tests (uses in-memory fakes, no database needed) |
| `npm run test:server` | Server route, redirect, file, and partner API tests |
| `npm run test:integration` | End-to-end integration tests through repositories against local PostgreSQL |
| `npm run db:start` | Starts the local PostgreSQL 17 Docker Compose container |
| `npm run db:stop` | Stops the local PostgreSQL container |
| `npm run db:migrate` | Runs pending database migrations from `db/migrations/` |
| `npm run db:reset` | Recreates public schema and reapplies all migrations |
| `npm run api-clients -- create/list/revoke` | Provisions or revokes partner API keys |
| `npm run seed:hotlines` | Loads `docs/hotline-seed.json` into the database as unverified hotlines |
| `npm run scan:secrets` | Scans repository for committed credentials and keys |
| `npm run audit:deps` | Audits production dependencies for security vulnerabilities |

## How it fits together

- The browser talks exclusively to Tabang's Node server over HTTPS from a single origin.
- Authentication uses secure `HttpOnly`, `SameSite=Lax` cookies with sessions stored in PostgreSQL.
- The Node server (`server/index.mjs`) is the single data boundary: it validates sessions, enforces access policies, and queries PostgreSQL via `server/db.mjs`.
- Report photos and responder applicant evidence are stored on disk under `UPLOAD_DIR` and served only after session authorization checks.
- Partner systems access `/api/v1` routes with hashed API keys and granular scopes.
- Client routes are in `src/routes/`; all client data interactions use repositories in `src/services/` that communicate with `/api/app/*`.
- Only `server/db.mjs` imports the `pg` database driver, and tests enforce this isolation.

The full design is in `docs/product/ARCHITECTURE.md`; current execution state is in `HANDOFF.md`; the partner API specification is in `docs/api/`.

## Roles

| Role | Can do |
|---|---|
| Resident | Report flooding, request help, see and cancel their own reports, rate hotlines, apply to be a responder |
| Responder | Everything a resident can, plus claim, advance, and verify incidents and publish advisories |
| Reviewer | Everything a responder can, plus decide responder applications and maintain hotlines |
| Admin | Everything, plus grant the reviewer and admin roles |

Roles are stored in the `public.role_assignments` table, which client applications cannot write to directly.
`docs/operations.md` explains how to grant the first administrator via SQL.

## Privacy

Contact numbers, descriptions, landmarks, exact locations, and photos are readable only by the reporter and authorized responders.
Photos and identity evidence files are kept in private storage accessible only through authenticated server streams; photos have their location metadata stripped in the browser before upload.
An applicant's identification and selfie files are permanently deleted from disk as soon as their application is decided.
External partner systems receive incident type, status, municipality, barangay, and timestamps only.

## Troubleshooting

- **`npm run db:start` fails**: Docker Desktop is not running or the engine has not started.
- **Server reports database connection error on startup**: verify `DATABASE_URL` in `.env` and confirm the local database is healthy with `docker ps`.
- **Free demo stage photos show "Photo unavailable"**: in the free demo stage on Render, files are stored on ephemeral container storage that clears when instances restart; upgrade to a persistent disk for permanent file storage.
- **Initial page load takes ~50 seconds on Render free tier**: Render free web services spin down after 15 minutes of inactivity; set up an external uptime ping to `/api/v1/health` every 10 minutes to maintain active status.
- **Render free database becomes unreachable after 30 days**: free Render databases expire after 30 days; export data via `pg_dump` and recreate, or upgrade to the paid database plan.
