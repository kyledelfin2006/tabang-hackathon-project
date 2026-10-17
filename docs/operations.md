# Operations

Procedures that cannot be automated, and the ones somebody will need under pressure.
Written to be followed by a person who did not build this.
Commands run from the repository root.

## Environment keys

Set these on the Node host and, for the `VITE_` ones, in the environment where the app is built.
Never commit them; `.env` is ignored and `npm run scan:secrets` fails on a committed `.env` or a Supabase secret key.

| Key | Where | What |
|---|---|---|
| `VITE_SUPABASE_URL` | Build | The project URL. Inlined into the app at build time. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build | The publishable key. Safe in the browser; row-level security does the protecting. |
| `SUPABASE_URL` | Host | The same project URL, for the server. |
| `SUPABASE_SECRET_KEY` | Host only | Bypasses row-level security. Never in the app, Git, logs, chat, or evidence. |
| `HOST`, `PORT` | Host | Where `npm start` listens (default `127.0.0.1:8000`). |
| `API_RATE_LIMIT_PER_MINUTE` | Host | Requests per minute per partner key, and per address on public routes (default 60). |

## Local development

```bash
npm run db:start      # starts Postgres, Auth, and Storage in Docker
npx supabase status   # prints the local URL and keys for .env
npm run db:reset      # rebuilds the database from supabase/migrations
npm run test:policies # policy tests against the local stack
npm run db:stop
```

The local stack sends no real email: password reset messages appear in the local mail viewer listed by `npx supabase status`.

## Creating the hosted project

1. Create a project in the Supabase dashboard (Singapore region proposed, Q-4).
2. Under Authentication, set the minimum password length to 8, set the Site URL to the app's address, and add `<app address>/update-password` as a redirect URL.
3. Decide email confirmation (D-17) and configure a custom SMTP sender before real users (Q-5); the built-in sender is restricted and rate limited.
4. Link and apply the committed migrations:

```bash
npx supabase login
npx supabase link --project-ref <project ref>
npx supabase db push
```

Only ever change the hosted database through committed migrations.
Confirm the free plan limits on the Supabase pricing page before go-live; the architecture records them as remembered, not verified.

## Building and starting

```bash
npm ci
npm run check
npm run build
npm start
```

`npm start` reads `.env` if present, serves `dist/` and `/api/v1` on one port, and sends the security headers, including a Content Security Policy that allows only the app's own origin and the configured Supabase project.
Run it behind HTTPS on the chosen host (Q-1).

### Sign-in fails for everyone

Almost always a build made without the `VITE_SUPABASE_*` values.
Vite inlines them at build time, so a build without them has no Supabase configuration and every sign-in fails.
`npm run build` refuses to run without them, so check the build environment, rebuild, and redeploy.
The browser console message `Tabang: Supabase failed to initialise` names the missing keys.

## Granting the first admin

No client can write roles, which is what makes them trustworthy, so the first admin is created by hand once.

1. Sign up in the app with the account that will be the admin.
2. In the Supabase dashboard, open the SQL editor and run, with that email:

```sql
insert into public.role_assignments (user_id, role)
select id, 'admin' from auth.users where email = 'admin@example.org'
on conflict (user_id) do update set role = excluded.role, assigned_at = now();
```

3. That account signs out and back in.

After this, reviewers decide responder applications in the app.
To make someone a reviewer, run the same statement with their email and `'reviewer'`.

## Revoking a responder

1. In the SQL editor, set their role back to resident:

```sql
update public.role_assignments set role = 'resident', assigned_at = now()
where user_id = (select id from auth.users where email = 'responder@example.org');
```

2. Their session picks up the change when it next refreshes, within the hour, or at once if they sign out.
3. Their past incident events stay; the audit trail is append-only by design.

## Hotlines

Load the carried-over numbers once:

```bash
npm run seed:hotlines
```

Every record arrives unverified, and running it again leaves existing hotlines alone.
To verify one, ring the number and confirm the organisation answers and covers the area, then in the dashboard's table editor set `verified` to true, `verified_at` to now, and `verified_by` to your name or office on that row of `public.hotlines`.
Re-verify every six months; the app flags older verifications.
Never mark a number verified that you have not rung.

## Partner API clients

```bash
npm run api-clients -- create --name "DOST Signal" --scopes signals:write,incidents:read
npm run api-clients -- list
npm run api-clients -- revoke --id <client id>
```

`create` prints the key once; only its hash is stored, so a lost key is revoked and replaced, never recovered.
Give keys to partners over a secure channel.
`docs/api/README.md` is the partner-facing guide.

## Keeping the project awake

A free Supabase project pauses after a period without activity, and then every data call fails until someone resumes it in the dashboard.
Set an external uptime monitor to call `GET /api/v1/advisories` on the deployed host every few hours; that route reads the database, so it both detects an outage and keeps the project active.

## Moderating a report

Residents cancel reports; they never delete them, so the response record stays.
Abusive or mistaken content can be removed by an admin in the dashboard's table editor; this is the only deletion path and should be rare.
If a resident asks for their data to be removed, agree with them what happens to the incident history first, because deleting a report removes the response record too.

## Evidence that failed to delete

When a reviewer decides an application but the ID or selfie could not be deleted, the app says "evidence deletion pending".
The decision stands.
In the dashboard, open Storage, bucket `identity-evidence`, folder named with the applicant's id, and delete the files.

## Backups

The free plan has no point-in-time recovery.
Before any risky change, take a dump with the linked CLI:

```bash
npx supabase db dump --data-only -f backup-$(date +%Y%m%d).sql
```

Keep dumps out of Git and somewhere access-controlled; they contain personal data.

## Rotating secrets

- **Supabase secret key**: create a new secret key in the dashboard under API keys, set it as `SUPABASE_SECRET_KEY` on the host, restart, then delete the old key.
- **Partner keys**: revoke and create a new one with `npm run api-clients`.
- **The S-01 exposure**: before September 2026 the old server published the project directory, including the Cloudinary API secret in `.env`. Rotate or delete that Cloudinary account's secret, and try to recover the old Firebase account so its project can be deleted (Q-6). No current build uses either.

## The app uses no webfont

The Content Security Policy is `style-src 'self'; font-src 'self'`, so a Google Fonts link is blocked.
That is deliberate: a webfont that fails on a weak connection is worse than none during a flood.
To ship a font, install it as a package and import it, so the files are served from the same origin.
