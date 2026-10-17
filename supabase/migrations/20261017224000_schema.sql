-- Tabang schema: tables, constraints, row-level security, and column grants.
--
-- The browser talks to these tables directly (D-12), so this file is the
-- security boundary. Every table has row-level security, every client write is
-- limited to named columns, and anything with a business rule (claiming,
-- transitions, verification, applications, roles) goes through the functions
-- in the next migration instead of a wide update policy (D-18).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when every path sits under the prefix and is a sane length. Used by
-- check constraints so a report or application can only point at files in its
-- own storage folder.
create function public.paths_under(paths text[], prefix text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(starts_with(p, prefix) and char_length(p) <= 255), true)
  from unnest(paths) as p;
$$;

-- ---------------------------------------------------------------------------
-- Accounts and roles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  barangay text not null check (char_length(barangay) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_assignments (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('resident', 'responder', 'reviewer', 'admin')),
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now()
);

-- A missing role_assignments row means resident. Security definer so policies
-- on role_assignments itself can call it without recursing.
create function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select ra.role from public.role_assignments ra where ra.user_id = auth.uid()),
    'resident'
  );
$$;

create function public.is_responder()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
    and public.app_role() in ('responder', 'reviewer', 'admin');
$$;

create function public.is_reviewer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null and public.app_role() in ('reviewer', 'admin');
$$;

create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null and public.app_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Reports and their audit trail
-- ---------------------------------------------------------------------------

create table public.incident_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

-- The same moves as ALLOWED_TRANSITIONS in incidentLifecycle.js; a policy test
-- compares the two. Cancellation is a reporter action and is not listed.
insert into public.incident_transitions (from_status, to_status) values
  ('new', 'acknowledged'),
  ('acknowledged', 'dispatched'),
  ('acknowledged', 'resolved'),
  ('dispatched', 'on_scene'),
  ('dispatched', 'resolved'),
  ('on_scene', 'resolved');

create table public.reports (
  -- Generated on the client once per form session, so a retried submission
  -- lands on the same row instead of filing the emergency twice.
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('flood', 'help')),
  municipality text check (char_length(municipality) between 1 and 80),
  barangay text check (char_length(barangay) between 1 and 80),
  landmark text check (char_length(landmark) <= 120),
  public_location_label text not null check (char_length(public_location_label) between 1 and 120),
  latitude double precision check (latitude between 4.5 and 21.5),
  longitude double precision check (longitude between 116 and 127),
  description text not null check (char_length(description) between 10 and 1000),
  contact_phone text not null check (contact_phone ~ '^(\+63|0)9[0-9]{9}$'),
  severity text check (severity in ('ankle', 'knee', 'waist', 'chest', 'above-head')),
  need text check (need in ('rescue', 'medical', 'food-water', 'shelter', 'other')),
  people_affected integer check (people_affected between 1 and 200),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 3),
  public_summary text not null default '' check (char_length(public_summary) <= 240),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  incident_status text not null default 'new'
    check (incident_status in ('new', 'acknowledged', 'dispatched', 'on_scene', 'resolved', 'cancelled')),
  assigned_responder_ids uuid[] not null default '{}'
    check (cardinality(assigned_responder_ids) <= 1),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_coordinates_together check ((latitude is null) = (longitude is null)),
  constraint reports_kind_fields check (
    (kind = 'flood' and severity is not null and need is null and people_affected is null)
    or (kind = 'help' and severity is null and need is not null and people_affected is not null)
  ),
  constraint reports_image_paths_own_folder check (
    public.paths_under(image_paths, reporter_id::text || '/' || id::text || '/')
  )
);

create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc, id desc);
create index reports_status_created_idx on public.reports (incident_status, created_at, id);

create table public.report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  type text not null check (type in ('status-change', 'verification')),
  from_status text,
  to_status text,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('resident', 'responder', 'reviewer', 'admin')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index report_events_report_idx on public.report_events (report_id, created_at, id);

-- ---------------------------------------------------------------------------
-- Inbound signals and the public feed
-- ---------------------------------------------------------------------------

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  source text not null check (char_length(source) between 1 and 64),
  external_id text not null check (char_length(external_id) between 1 and 128),
  type text not null
    check (type in ('tropical-cyclone-wind-signal', 'rainfall-warning', 'flood-advisory', 'other')),
  level text check (char_length(level) <= 32),
  headline text not null check (char_length(headline) between 1 and 200),
  body text check (char_length(body) <= 2000),
  areas jsonb not null default '[]' check (jsonb_typeof(areas) = 'array'),
  issued_at timestamptz not null,
  expires_at timestamptz,
  url text check (url ~ '^https://' and char_length(url) <= 2048),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table public.public_feed (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('flood', 'help', 'advisory')),
  summary text not null check (char_length(summary) between 1 and 240),
  municipality text check (char_length(municipality) between 1 and 80),
  barangay text check (char_length(barangay) between 1 and 80),
  source text not null default 'tabang' check (char_length(source) between 1 and 64),
  signal_id uuid unique references public.signals (id) on delete cascade,
  published boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create index public_feed_published_created_idx on public.public_feed (published, created_at desc);

-- ---------------------------------------------------------------------------
-- Hotlines and ratings
-- ---------------------------------------------------------------------------

create table public.hotlines (
  id text primary key default gen_random_uuid()::text check (id ~ '^[a-z0-9-]{1,64}$'),
  organization text not null check (char_length(organization) between 1 and 120),
  coverage_area text not null default '' check (char_length(coverage_area) <= 120),
  phone_numbers text[] not null default '{}' check (
    cardinality(phone_numbers) <= 5
    and array_to_string(phone_numbers, '') !~ '[^0-9()+ -]'
  ),
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by text not null default '' check (char_length(verified_by) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotlines_verified_has_date check (not verified or verified_at is not null)
);

create table public.hotline_reviews (
  hotline_id text not null references public.hotlines (id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 300),
  updated_at timestamptz not null default now(),
  primary key (hotline_id, reviewer_id)
);

-- Totals are computed, never stored, so there is nothing for a client to forge
-- and nothing to keep in sync (D-19).
create view public.hotline_directory
with (security_invoker = true)
as
select
  h.id,
  h.organization,
  h.coverage_area,
  h.phone_numbers,
  h.verified,
  h.verified_at,
  h.verified_by,
  h.updated_at,
  count(r.rating)::integer as rating_count,
  coalesce(sum(r.rating), 0)::integer as rating_total
from public.hotlines h
left join public.hotline_reviews r on r.hotline_id = h.id
group by h.id;

-- ---------------------------------------------------------------------------
-- Responder applications and partner clients
-- ---------------------------------------------------------------------------

create table public.responder_applications (
  applicant_id uuid primary key references auth.users (id) on delete cascade,
  organization text not null check (char_length(organization) between 2 and 120),
  badge_number text not null check (char_length(badge_number) between 2 and 60),
  municipality text not null check (char_length(municipality) between 2 and 80),
  identity_document_path text,
  selfie_path text,
  consent_version text not null check (char_length(consent_version) between 1 and 64),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text not null default '' check (char_length(review_notes) <= 1000),
  constraint responder_applications_pending_has_evidence check (
    status <> 'pending' or (identity_document_path is not null and selfie_path is not null)
  ),
  constraint responder_applications_evidence_own_folder check (
    public.paths_under(
      array_remove(array[identity_document_path, selfie_path], null),
      applicant_id::text || '/'
    )
  )
);

create index responder_applications_status_idx on public.responder_applications (status, submitted_at);

create table public.api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{}'
    check (scopes <@ array['incidents:read', 'signals:write']::text[]),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports
  for each row execute function public.touch_updated_at();
create trigger signals_touch before update on public.signals
  for each row execute function public.touch_updated_at();
create trigger public_feed_touch before update on public.public_feed
  for each row execute function public.touch_updated_at();
create trigger hotlines_touch before update on public.hotlines
  for each row execute function public.touch_updated_at();
create trigger hotline_reviews_touch before update on public.hotline_reviews
  for each row execute function public.touch_updated_at();

-- A reviewer may unpublish somebody else's advisory but not rewrite it.
create function public.guard_public_feed_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and old.created_by is distinct from auth.uid() then
    if new.published or (to_jsonb(new) - 'published' - 'updated_at')
        is distinct from (to_jsonb(old) - 'published' - 'updated_at') then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger public_feed_guard before update on public.public_feed
  for each row execute function public.guard_public_feed_update();

-- ---------------------------------------------------------------------------
-- Sign-up creates the profile
-- ---------------------------------------------------------------------------

-- Runs in the same transaction as the account, so a profile exists even when
-- the browser closes mid sign-up. Invalid metadata fails the constraints and
-- with them the sign-up itself.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[\s()-]', '', 'g');
begin
  if v_phone like '+63%' then
    v_phone := '0' || substr(v_phone, 4);
  end if;

  insert into public.profiles (id, display_name, email, phone, barangay)
  values (
    new.id,
    btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '\s+', ' ', 'g')),
    lower(coalesce(new.email, '')),
    v_phone,
    btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'barangay', ''), '\s+', ' ', 'g'))
  );

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.incident_transitions enable row level security;
alter table public.reports enable row level security;
alter table public.report_events enable row level security;
alter table public.signals enable row level security;
alter table public.public_feed enable row level security;
alter table public.hotlines enable row level security;
alter table public.hotline_reviews enable row level security;
alter table public.responder_applications enable row level security;
alter table public.api_clients enable row level security;

create policy "owner or reviewer reads profiles" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_reviewer());
create policy "owner updates own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "owner or reviewer reads roles" on public.role_assignments
  for select to authenticated
  using (user_id = auth.uid() or public.is_reviewer());

create policy "everyone reads transitions" on public.incident_transitions
  for select to anon, authenticated
  using (true);

create policy "reporter or responder reads reports" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_responder());
create policy "reporter files own report" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "reporter or responder reads events" on public.report_events
  for select to authenticated
  using (
    public.is_responder()
    or exists (
      select 1 from public.reports r
      where r.id = report_events.report_id and r.reporter_id = auth.uid()
    )
  );

create policy "everyone reads live advisories" on public.public_feed
  for select to anon, authenticated
  using (published and (expires_at is null or expires_at > now()));
create policy "responders read their own advisories" on public.public_feed
  for select to authenticated
  using (created_by = auth.uid() and public.is_responder());
create policy "reviewers read all advisories" on public.public_feed
  for select to authenticated
  using (public.is_reviewer());
create policy "responders publish advisories" on public.public_feed
  for insert to authenticated
  with check (public.is_responder() and created_by = auth.uid() and source = 'tabang');
create policy "responders edit their own advisories" on public.public_feed
  for update to authenticated
  using (created_by = auth.uid() and public.is_responder())
  with check (created_by = auth.uid() and source = 'tabang');
create policy "reviewers unpublish advisories" on public.public_feed
  for update to authenticated
  using (public.is_reviewer())
  with check (public.is_reviewer());

create policy "everyone reads hotlines" on public.hotlines
  for select to anon, authenticated
  using (true);
create policy "reviewers add hotlines" on public.hotlines
  for insert to authenticated
  with check (public.is_reviewer());
create policy "reviewers edit hotlines" on public.hotlines
  for update to authenticated
  using (public.is_reviewer())
  with check (public.is_reviewer());
create policy "reviewers remove hotlines" on public.hotlines
  for delete to authenticated
  using (public.is_reviewer());

create policy "everyone reads hotline reviews" on public.hotline_reviews
  for select to anon, authenticated
  using (true);
create policy "owner writes own review" on public.hotline_reviews
  for insert to authenticated
  with check (reviewer_id = auth.uid());
create policy "owner edits own review" on public.hotline_reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());
create policy "owner or reviewer removes a review" on public.hotline_reviews
  for delete to authenticated
  using (reviewer_id = auth.uid() or public.is_reviewer());

create policy "owner or reviewer reads applications" on public.responder_applications
  for select to authenticated
  using (applicant_id = auth.uid() or public.is_reviewer());

-- signals and api_clients have no policy: only the server's secret key, which
-- bypasses row-level security, can reach them.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Start from nothing so a default privilege cannot widen access, then grant
-- exactly what the policies above expect.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, phone, barangay) on public.profiles to authenticated;

grant select on public.role_assignments to authenticated;

grant select on public.incident_transitions to anon, authenticated;

grant select on public.reports to authenticated;
-- Priority, statuses, assignment, timestamps, and the reporter are absent, so a
-- client cannot choose them; they take their defaults.
grant insert (
  id, kind, municipality, barangay, landmark, public_location_label, latitude,
  longitude, description, contact_phone, severity, need, people_affected,
  image_paths, public_summary
) on public.reports to authenticated;

grant select on public.report_events to authenticated;

grant select on public.public_feed to anon, authenticated;
grant insert (kind, summary, municipality, barangay, published, expires_at)
  on public.public_feed to authenticated;
grant update (kind, summary, municipality, barangay, published, expires_at)
  on public.public_feed to authenticated;

grant select on public.hotlines to anon, authenticated;
grant insert (id, organization, coverage_area, phone_numbers, verified, verified_at, verified_by)
  on public.hotlines to authenticated;
grant update (organization, coverage_area, phone_numbers, verified, verified_at, verified_by)
  on public.hotlines to authenticated;
grant delete on public.hotlines to authenticated;

grant select on public.hotline_reviews to anon, authenticated;
grant insert (hotline_id, rating, comment) on public.hotline_reviews to authenticated;
-- hotline_id is included so an upsert can replace the caller's own review.
grant update (hotline_id, rating, comment) on public.hotline_reviews to authenticated;
grant delete on public.hotline_reviews to authenticated;

grant select on public.hotline_directory to anon, authenticated;

grant select on public.responder_applications to authenticated;

-- The role helpers and paths_under stay executable by everyone, because
-- policies and check constraints call them as the requesting role; the role
-- helpers only reveal the caller's own role.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.guard_public_feed_update() from public, anon, authenticated;
