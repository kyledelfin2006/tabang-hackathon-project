# Operations

Procedures that cannot be automated, and the ones somebody will need under pressure.
Written to be followed by a person who did not build this.
Commands run from the repository root.

## Environment keys

Set these in `.env` for local development, or in the Render dashboard for hosted environments.
Never commit secrets; `.env` is ignored and `npm run scan:secrets` fails on committed `.env` files or credentials.
Passwords, session tokens, reset tokens, and `DATABASE_URL` must never appear in logs, chat, Git, or evidence.

| Key | Where | What |
|---|---|---|
| `DATABASE_URL` | Host | PostgreSQL connection string (`postgres://user:pass@host:port/dbname`). Injected automatically by Render from the database service. |
| `UPLOAD_DIR` | Host | Directory path where report photos and responder applicant evidence are stored. Local: `uploads`. Render free: `uploads`. Render paid: `/var/data/uploads`. |
| `APP_ORIGIN` | Host | Canonical application origin for CSRF checks and reset links (e.g. `http://127.0.0.1:8000` or `https://tabang-app.onrender.com`). |
| `EMAIL_API_KEY` | Host | API key for the HTTP email delivery service (e.g. Resend). When unset in non-production, reset links print to the server console. |
| `EMAIL_FROM` | Host | Sender email address for outgoing messages (e.g. `Tabang <noreply@yourdomain.com>`). |
| `HOST`, `PORT` | Host | Address and port where `npm start` listens (default `127.0.0.1:8000`). Injected by Render in production. |
| `API_RATE_LIMIT_PER_MINUTE` | Host | Allowed requests per minute per partner API key, and per address on public routes (default 60). |

## Local development

```bash
npm run db:start          # starts the PostgreSQL 17 container in Docker
npm run db:migrate        # applies pending migrations from db/migrations
npm run db:reset          # drops and rebuilds public schema from db/migrations
npm run test:integration  # runs integration suite against the local database
npm run db:stop           # stops the local database container
```

Local development sends no real email when `EMAIL_API_KEY` is empty: password reset links print directly to the server terminal.

## Deployment stages

Tabang runs on Render in two distinct operational stages:

1. **Demo Stage (Free Plan)**:
   - Web service: Render free tier (Node runtime, Singapore region).
   - Database: Render free PostgreSQL (Singapore region).
   - Files: Container filesystem (`UPLOAD_DIR=uploads`). Files do not persist across instance sleeps, redeploys, or restarts. If a photo is absent, the app displays "Photo unavailable".
   - Reset email: Prints to server logs if `EMAIL_API_KEY` is not provided, or sends via HTTP email API if configured.
   - Database lifespan: Free PostgreSQL instances expire after 30 days.

2. **Launch Stage (Paid Plan)**:
   - Web service: Render Starter or Standard plan (always on, zero sleep latency).
   - Database: Render Starter PostgreSQL with automated daily backups and persistence.
   - Files: Render persistent disk mounted at `/var/data/uploads` (`UPLOAD_DIR=/var/data/uploads`).
   - Reset email: HTTP email provider configured with verified domain sender.

## Deploying to Render via Blueprint

1. Fork or push the repository to your GitHub or GitLab account.
2. In the Render Dashboard, select **New** and choose **Blueprint**.
3. Connect the repository containing `render.yaml`.
4. Render detects the web service and PostgreSQL database defined in `render.yaml`.
5. For the web service, set `APP_ORIGIN` to your generated service URL (e.g. `https://tabang-app.onrender.com`).
6. If configuring email delivery, provide `EMAIL_API_KEY` and `EMAIL_FROM`.
7. Click **Apply**.
8. Render provisions PostgreSQL, runs `npm ci --include=dev && npm run build`, runs `npm start` (which automatically applies database migrations), and verifies health at `/api/v1/health`.

## Granting the first admin

Client browsers cannot write to role assignments directly.
The first administrative account is created manually via SQL using `psql` or Render's database shell.

1. Sign up for an account in the deployed web application with your administrator email.
2. Connect to the database using `psql "$DATABASE_URL"` or via Render's database dashboard:

```sql
insert into public.role_assignments (user_id, role)
select id, 'admin' from public.users where email = 'admin@example.org'
on conflict (user_id) do update set role = excluded.role, assigned_at = now();
```

3. Sign out of the application and sign back in.

After the first admin exists, reviewers review and decide responder applications directly within the application UI.
To grant reviewer status to another user, run the same query substituting `'reviewer'` for `'admin'`.

## Revoking a role

1. In `psql` or the database shell, demote the user back to resident:

```sql
update public.role_assignments
set role = 'resident', assigned_at = now()
where user_id = (select id from public.users where email = 'user@example.org');
```

2. The demoted user loses access immediately on their next request because the server verifies roles on every protected call.
3. Historical incident audit events and reviews are immutable and remain intact.

## Hotlines

Seed initial emergency hotlines once after initial deployment:

```bash
npm run seed:hotlines
```

Records are imported unverified. Existing hotlines are never overwritten.
To mark a hotline verified: call the telephone number, verify coverage and operational readiness, and update `verified`, `verified_at`, and `verified_by` in `public.hotlines`:

```sql
update public.hotlines
set verified = true, verified_at = now(), verified_by = 'Office of Civil Defense Region VI'
where id = '<hotline-uuid>';
```

Hotlines should be re-verified at least every six months. Never verify a hotline without placing a verification call.

## Partner API clients

Manage credentials for external integration partners such as DOST:

```bash
npm run api-clients -- create --name "DOST Signal" --scopes signals:write,incidents:read
npm run api-clients -- list
npm run api-clients -- revoke --id <client-id>
```

The plain API key is printed only once upon creation. Only its SHA-256 hash is stored in the database.
If a partner misplaces a key, revoke the old client ID and generate a new key.
Provide keys to partners only over encrypted, authorized communication channels.
See `docs/api/README.md` for complete partner API integration details.

## Free demo stage operations

### 30-day free database expiry

Render free PostgreSQL databases expire exactly 30 days after creation.
Before the 30-day mark:
1. Export current data with `pg_dump`:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --file=tabang-backup.dump
   ```
2. Provision a new free database in the Render dashboard.
3. Restore the schema and data into the new instance:
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges -d "$NEW_DATABASE_URL" tabang-backup.dump
   ```
4. Update `DATABASE_URL` in the web service environment settings.
Alternatively, upgrade the database to the paid Starter plan, which removes expiration entirely.

### Keeping the free service awake

Render free web services enter sleep mode after 15 minutes of inactivity.
Waking from sleep takes 45 to 60 seconds on the initial visit.
To keep the service awake during active demos:
Set an external uptime monitor (such as UptimeRobot or Better Uptime) to send an HTTP GET request to `https://<your-service>.onrender.com/api/v1/health` every 10 minutes.
This keeps the service running and consumes approximately 744 hours per 31-day month, which fits within Render's 750 free monthly web service hours.

## Upgrading to paid launch stage

When deploying for operational disaster response:
1. Open `render.yaml` and reference the commented launch configuration.
2. Upgrade web service plan to `starter` or higher to eliminate sleep mode.
3. Attach a persistent disk (10 GB or larger) mounted at `/var/data/uploads`.
4. Set `UPLOAD_DIR=/var/data/uploads`.
5. Upgrade the PostgreSQL database to `starter` or higher for persistent storage and automated daily backups.
6. Configure a production HTTP email service by setting `EMAIL_API_KEY` and `EMAIL_FROM`.
7. Apply Blueprint changes in Render.

## Rotating the database credentials

If the database password or connection string is rotated:
1. Update `DATABASE_URL` in the Render web service environment settings.
2. Trigger a manual deploy or restart the web service.
3. The server runs `npm run db:migrate` upon booting and verifies database connectivity before accepting incoming traffic.
4. Verify service availability by calling `GET /api/v1/health`.

## Moderating a report

Residents may cancel their own reports, but cannot delete them from the database.
If administrative data removal is legally mandated or required for emergency safety:
1. Connect via `psql "$DATABASE_URL"`.
2. Inspect the associated incident and child records before removing.
3. Deleting a report record cascades to report photos and responder timeline events.
Coordinate with responders before performing any manual data removal.

## Evidence that failed to delete

When a reviewer decides an application and disk cleanup encounters an error, the reviewer interface reports "evidence deletion pending".
The decision itself is recorded and valid.
To clean up disk storage manually, navigate to the uploads directory on the host:
`UPLOAD_DIR/evidence/<applicant-user-id>/`
and delete the applicant's submitted identification files.

## Backups

For databases without automated backup policies, take periodic logical backups:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date +%Y%m%d).dump"
```

To restore from a logical backup file:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "backup-20261021.dump"
```

Never store dump files in Git repositories or public locations. Backup dumps contain sensitive resident and incident data.
