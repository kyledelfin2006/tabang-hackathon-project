# Implementation Plan: FEAT-002 Move Tabang from Supabase to Render

Created: 2026-10-21T10:43:43+08:00
Updated: 2026-10-21T10:49:23+08:00
Revision: 1
Status: Approved
**Execution mode:** auto, no hard stops (see section 1.1)
Feature spec and revision: [FEAT-002 Revision 1](../features/FEAT-002-render-migration.md), approved
Approved baseline and architecture revisions: [Architecture Revision 3](../product/ARCHITECTURE.md), approved
Len's chat approval: Approved by Len in chat on 2026-10-21 at about 10:49 +08:00: "Alright create a handoff for another AI coding agent to execute. Skip the mandatory hard stops but keep thre required commiting and testing phases"
Executor: another AI coding agent, handed off through `HANDOFF.md`; any agent that can run shell commands and Git
Target branch: `feat-002/render`, created on 2026-10-21 from `feat-001/integration` at `f8e08d8`; Len merges it

## Scope

This plan implements FEAT-002 REQ-001 to REQ-018 in one worktree with one Claude Code agent, one phase at a time.
The old Supabase path keeps working until Phase 5 switches the client, so every phase ends with passing checks.

Existing edits to preserve:

- The untracked toolkit files (`.agents/`, `.claude/`, `.editorconfig`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`); never stage or delete them.
- The local untracked `.env`; never stage or print its values.
- `feat-001/integration` and its pushed copy on `origin`; this plan only adds commits on `feat-002/render`.

## 1. Working rules

### 1.1 No hard stops (Len, 2026-10-21)

Len waived the mandatory hard stops for this run and kept the testing and commit gates.
For this plan only, these rules replace the stop rules in the workspace `AGENTS.md`:

- Run Phases 1 to 6 in order without pausing for review, approval, or questions.
- The three-attempt limit does not stop the run: keep fixing within the approved architecture, and record every attempt with its result in `HANDOFF.md`.
- A decision the specs leave open is made by the agent: choose the option closest to the approved specs and the simplest one, record it in `HANDOFF.md` under "Decisions made by the agent", and continue.
- If Docker Desktop is not running, start it and wait for `docker info` to succeed.

These gates still hold and are not waived:

- A phase is committed only after its verification commands pass; record the actual output in evidence.
- Never skip, weaken, mark as skipped, or delete a test or check to make a phase pass; a FEAT-001 test is changed only where FEAT-002 replaces the behavior it checks.
- Never start a phase before the previous phase's checkpoint commit exists.
- If a gate truly cannot pass (for example, Docker cannot be started at all), leave the phase's work uncommitted, update `HANDOFF.md` with the evidence, and end the run; that is the only way the run ends early.

These prohibitions are not stops, and they still apply: never push, merge, rebase, reset, force-update, or deploy; never touch a hosted Render or Supabase service; never add a dependency other than `pg`; never stage `.env` or the untracked toolkit files; never change FEAT-002 behavior or the architecture beyond what the specs say.

### 1.2 Environment and evidence

- Work only in `Project_Tabang-integration` on `feat-002/render`.
- Observed on 2026-10-21: Node `v24.14.0`, Docker Compose `v5.4.0`, and `pg` `8.23.1` as the latest published version.
- Docker Desktop must be running for any `db:*` or `test:integration` command.
- Run `npm run db:stop` after each phase's checks; Phases 1 to 4 also stop the old Supabase stack (`npx supabase stop`) if they started it.
- Server and integration tests listen on port 0 and use a temporary `UPLOAD_DIR`.
- The only new dependency is `pg` (D-24); install it with `npm install pg@^8.23.1` and record the installed version in evidence.
- Record actual results in `docs/evidence/FEAT-002.md` in the `.agents/templates/docs/VERIFICATION.md` format, with Philippine-time timestamps.
- Every phase ends as in FEAT-001: verify, review the diff for correctness and simplicity, tick this plan's boxes, update evidence and `HANDOFF.md`, stage only reviewed paths (never `git add -A` or `git add .`), inspect `git diff --cached`, commit with the checkpoint message and no agent co-author line, and confirm the hash with `git log -1`.

## 2. Phases

### Phase 1: Local Postgres and the migration runner

Requirements: FEAT-002/REQ-001, REQ-002 (runner part)
State: Complete

Tasks:

- [x] `npm install pg@^8.23.1`; add `compose.yaml` with `postgres:17` on `127.0.0.1:54329`, a named volume, and a health check.
- [x] `server/db.mjs`: one pool from `DATABASE_URL`, a `withTransaction(fn)` helper, and nothing else imports `pg`.
- [x] `server/db/migrate.mjs`: applies `db/migrations/*.sql` in filename order, each in its own transaction, recording `schema_migrations`; stops with a non-zero exit naming the failed file.
- [x] `db/migrations/`: port the six Supabase migrations into plain Postgres:
  - add `users`, `sessions`, and `password_resets`;
  - point foreign keys at `users`;
  - remove row-level security, grants to `anon` and `authenticated`, the `handle_new_user` trigger, and the `storage` migration;
  - give each function a leading `p_actor uuid` and read the role from `role_assignments`.
- [x] Scripts: `db:start` (`docker compose up -d --wait`), `db:stop`, `db:migrate`, `db:reset` (drop and recreate the `public` schema, then migrate), `test:integration` (`node --test "tests/integration/**/*.test.mjs"`).
- [x] `tests/integration/migrations.test.mjs`: a fresh database migrates; a second run applies nothing; a broken migration in a temporary folder fails and records nothing.
- [x] Port `transitionParity` and the function-level checks of `reports`, `applications`, and `hotlines` to call the functions directly with `p_actor`.

Verification:

- [x] `npm run db:start`, `npm run db:reset`, `npm run test:integration`: all pass.
- [x] `npm run lint`, `npm run test:unit`, `npm run test:server`: pass, unchanged.

Checkpoint message: `feat(db): port the schema to plain postgres with a migration runner`

### Phase 2: Sign-in, sessions, and password reset

Requirements: FEAT-002/REQ-003, REQ-004, REQ-005, REQ-006, REQ-008
State: Complete

Tasks:

- [x] `server/sessions.mjs`: scrypt hash and verify, session create, look up, and delete, cookie read and write, token hashing.
- [x] `server/app/origin.mjs`: refuse state-changing requests without the app origin (`APP_ORIGIN`, defaulting to the request's own origin in development) or with a wrong content type.
- [x] `server/email.mjs`: `sendPasswordReset({to, link})` through one HTTP email API with `fetch`; console fallback only outside production; injectable for tests.
- [x] `server/app/session.mjs`: the session routes in the architecture, using `validateProfileInput`; in-memory sign-in limit of 10 failures per 15 minutes per email and per address.
- [x] Mount `/api/app` in `server/index.mjs` with the same error envelope, request ids, and body limits as `/api/v1`.
- [x] Tests in `tests/server/` with the in-memory store, and `tests/integration/accounts.test.mjs` against Postgres, covering every criterion of REQ-003 to REQ-006 and REQ-008.

Verification:

- [x] `npm run test:server` and `npm run test:integration`: pass.
- [x] `npm run lint` and `npm run test:unit`: pass.

Checkpoint message: `feat(auth): add tabang sign-in, sessions, and password reset`

### Phase 3: App data routes and the Postgres store

Requirements: FEAT-002/REQ-007 (server part), REQ-014, REQ-015
State: Complete

Tasks:

- [x] Rewrite `server/store.mjs` on `server/db.mjs`, keeping the partner functions' names and results; add the app queries with fixed column lists per role.
- [x] `server/app/*.mjs` for reports, incidents, advisories, hotlines, and applications, one route per repository method, each checking the session and role first.
- [x] Health check queries the database and answers 503 `unavailable` when it fails.
- [x] Port the `reports`, `publicFeed`, `hotlines`, `applications`, `store`, and `partnerApi` policy scenarios to `tests/integration/` as HTTP tests against the in-process server.

Verification:

- [x] `npm run test:integration` and `npm run test:server`: pass; `git diff f8e08d8 -- docs/api/openapi.json` shows no change.
- [x] `npm run lint` and `npm run test:unit`: pass.

Checkpoint message: `feat(api): serve app data from postgres behind session checks`

### Phase 4: Files on disk

Requirements: FEAT-002/REQ-009
State: Complete

Tasks:

- [x] `server/files.mjs`: write, stream, and delete under `UPLOAD_DIR` with path containment, type and leading-byte checks, and a 5 MB cap.
- [x] Upload and read routes in `server/app/files.mjs`; `decide_application` callers delete the applicant's evidence folder and report `evidenceDeleted`.
- [x] Port the `storage` policy scenarios to `tests/integration/files.test.mjs`, adding the path traversal and wrong-bytes cases.

Verification:

- [x] `npm run test:integration` and `npm run test:server`: pass.
- [x] `npm run lint` and `npm run test:unit`: pass.

Checkpoint message: `feat(files): store report photos and evidence on disk behind authorization`

### Phase 5: Switch the client and remove Supabase

Requirements: FEAT-002/REQ-007 (client part), REQ-010, REQ-011, REQ-012, REQ-016
State: Complete

Tasks:

- [x] `src/services/http/apiClient.js`; rewrite the auth gateway, the six repositories, and the uploader on it with unchanged method names.
- [x] Photo slots show "Photo unavailable" when an image fails to load.
- [x] Content Security Policy: `connect-src 'self'`, `img-src 'self' blob: data:`.
- [x] Remove `@supabase/supabase-js`, `supabase`, `src/config/supabase.js`, `server/supabaseAdmin.mjs`, `supabase/`, `scripts/build/check-env.mjs` and its build hook, `tests/policies/`, and the `VITE_SUPABASE_*` and `SUPABASE_*` keys.
- [x] Port the `repositories` and `smoke` scenarios to `tests/integration/` through the real client repositories with a cookie-keeping `fetch`.
- [x] Update `providerIsolation.test.js` for `pg` and `@supabase/*`; update unit tests whose fakes referenced Supabase shapes.
- [x] CI: replace the `policies` job with an `integration` job using a `postgres:17` service container.

Verification:

- [x] `npm ci`, `npm run lint`, `npm run test:unit` three times, `npm run test:server`, `npm run db:reset`, `npm run test:integration`, `npm run build`: pass.
- [x] `git grep -i supabase` outside `docs/archive`, `docs/evidence`, and the migration specs: no hits; the built `dist/` contains no Supabase URL or key name.
- [x] `npm audit --omit=dev --audit-level=high`: 0.

Checkpoint message: `refactor(client): move the app onto the tabang api and remove supabase`

### Phase 6: Render deployment and documentation

Requirements: FEAT-002/REQ-002 (start part), REQ-013, REQ-017, REQ-018
State: Not started

Tasks:

- [ ] `npm start` runs the migration runner, then the server.
- [ ] `render.yaml`: the web service and Postgres in Singapore on the free plan, health check `/api/v1/health`, `DATABASE_URL` from the database, and a commented launch block with the disk and paid plans.
- [ ] Rewrite `README.md`, `docs/operations.md`, and `.env.example` for Render: both stages, first admin with `psql`, `pg_dump` backups, the 30-day free database expiry, the uptime check, the email keys, and rotating `DATABASE_URL`.
- [ ] Archive the Supabase-specific operations text in `docs/archive/`; update `docs/SPEC_INDEX.md` and add a note to FEAT-001 for the requirements FEAT-002 replaces.
- [ ] `scripts/api-clients.mjs` and `scripts/seed-hotlines.mjs` use `server/db.mjs`.

Verification:

- [ ] `npm run check`: pass.
- [ ] Server smoke: `npm run db:reset`, `npm run build`, then `PORT=18123 npm start` against an empty database applies the migrations, and `curl` shows the FEAT-001 phase 8 answers plus `/api/app/session` returning `null`.
- [ ] Browser scenarios with screenshots, if a browser tool is available; otherwise record "Not run".
- [ ] A Render deploy is Len's check (REQ-013); record it as pending.

Checkpoint message: `docs: document the render deployment`

## 3. Len's actions outside the agent's scope

- Approved on 2026-10-21: Architecture Revision 3, FEAT-002 Revision 1, this plan Revision 1, D-20, D-26, and execution without hard stops.
- Start the other agent with the prompt in section 4, on a machine with Docker Desktop installed.
- Review the "Decisions made by the agent" list in `HANDOFF.md` after the run.
- Create the Render account and apply the Blueprint (Q-7); create the first admin; seed hotlines.
- Choose the email provider and sender, and set `EMAIL_API_KEY` and `EMAIL_FROM` (Q-5).
- Recreate the free demo database before its 30-day expiry, or move to paid (Q-8).
- Confirm Render's paid prices, disk snapshots, and Postgres backups before launch.
- Merge `feat-002/render` when satisfied.

## Recovery

Section 1.1 replaces the workspace stop rules for this run.
Record every attempt and unresolved problem in `HANDOFF.md`; attempt counts carry across sessions.
Interrupted or failing work remains uncommitted and the phase remains incomplete.
A new session resumes at the first phase whose checkpoint commit is not in `git log`.

## 4. Agent prompt

Open the agent in `Project_Tabang-integration` (the Git worktree on `feat-002/render`) and paste:

```text
You are the single implementing agent for Tabang FEAT-002 Revision 1: move the app from Supabase to Render (own sign-in, Postgres through the pg driver, files on disk, an internal /api/app API). Execution mode is auto with no hard stops: run Phases 1 to 6 of the plan in order without pausing for review, approval, or questions.

Read first, in full: AGENTS.md (workspace rules), docs/SPEC_INDEX.md, HANDOFF.md, docs/plans/FEAT-002-implementation.md, docs/features/FEAT-002-render-migration.md, and docs/product/ARCHITECTURE.md Revision 3. Run git status and git log -8 and reconcile them with HANDOFF.md; prior chat memory is not authoritative.

Plan section 1.1 replaces AGENTS.md's stop rules for this run: do not stop after three failed attempts (keep fixing within the architecture and log every attempt in HANDOFF.md), and make any open decision yourself (closest to the specs, simplest), logging it under "Decisions made by the agent" in HANDOFF.md. If Docker Desktop is not running, start it.

Gates you must keep for every phase: implement the tasks; run the phase's verification commands; commit only when they pass; never skip, weaken, or delete a test to pass; record actual output with +08:00 timestamps in docs/evidence/FEAT-002.md; tick the plan boxes; update HANDOFF.md; stage only reviewed paths (never git add -A or git add .); inspect git diff --cached; commit with the phase's checkpoint message and no AI co-author line; confirm the hash with git log -1; then continue.

If git status shows the approved documents (HANDOFF.md, docs/SPEC_INDEX.md, docs/product/ARCHITECTURE.md, docs/features/FEAT-002-render-migration.md, docs/plans/FEAT-002-implementation.md) uncommitted, commit exactly those five first with "docs(feat-002): approve the render migration and hand off execution". Then resume at the first phase whose checkpoint commit is not in git log.

Never: push, merge, rebase, reset, or deploy; touch a hosted Render or Supabase service; add a dependency other than pg; import pg outside server/db.mjs; stage .env or the untracked toolkit files (.agents/, .claude/, .editorconfig, AGENTS.md, CLAUDE.md, GEMINI.md); log or record passwords, tokens, or DATABASE_URL; describe an unrun check as passing; use em dashes in Markdown.

End the run early only if a phase gate cannot pass at all (for example Docker cannot start); leave that work uncommitted and update HANDOFF.md first.

Report at the end: phases with commit hashes, checks with results, items not run, attempts per problem, decisions you made, and the next action for Len.
```
