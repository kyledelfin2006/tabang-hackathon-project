-- Tabang plain Postgres schema: tables, constraints, indexes, and triggers.
-- The server is the only data boundary (D-20); no row-level security or column grants.

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
-- Accounts, sessions, and roles
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table public.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_id_idx on public.sessions (user_id);

create table public.password_resets (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index password_resets_user_id_idx on public.password_resets (user_id);

create table public.profiles (
  id uuid primary key references public.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  barangay text not null check (char_length(barangay) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_assignments (
  user_id uuid primary key references public.users (id) on delete cascade,
  role text not null check (role in ('resident', 'responder', 'reviewer', 'admin')),
  assigned_by uuid references public.users (id) on delete set null,
  assigned_at timestamptz not null default now()
);

create function public.app_role(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select ra.role from public.role_assignments ra where ra.user_id = p_user_id),
    'resident'
  );
$$;

create function public.is_responder(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_user_id is not null
    and public.app_role(p_user_id) in ('responder', 'reviewer', 'admin');
$$;

create function public.is_reviewer(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_user_id is not null and public.app_role(p_user_id) in ('reviewer', 'admin');
$$;

create function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_user_id is not null and public.app_role(p_user_id) = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Reports and their audit trail
-- ---------------------------------------------------------------------------

create table public.incident_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

insert into public.incident_transitions (from_status, to_status) values
  ('new', 'acknowledged'),
  ('acknowledged', 'dispatched'),
  ('acknowledged', 'resolved'),
  ('dispatched', 'on_scene'),
  ('dispatched', 'resolved'),
  ('on_scene', 'resolved');

create table public.reports (
  id uuid primary key,
  reporter_id uuid not null references public.users (id) on delete cascade,
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
  actor_id uuid references public.users (id) on delete set null,
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
  created_by uuid references public.users (id) on delete set null,
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
  reviewer_id uuid not null references public.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 300),
  updated_at timestamptz not null default now(),
  primary key (hotline_id, reviewer_id)
);

create view public.hotline_directory as
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
  applicant_id uuid primary key references public.users (id) on delete cascade,
  organization text not null check (char_length(organization) between 2 and 120),
  badge_number text not null check (char_length(badge_number) between 2 and 60),
  municipality text not null check (char_length(municipality) between 2 and 80),
  identity_document_path text,
  selfie_path text,
  consent_version text not null check (char_length(consent_version) between 1 and 64),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users (id) on delete set null,
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
