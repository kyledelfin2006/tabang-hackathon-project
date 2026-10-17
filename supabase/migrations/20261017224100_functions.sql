-- State changes with business rules (D-18).
--
-- Postgres policies cannot compare a row's old and new values the way the
-- Firestore rules did, so each change below checks the caller, reads the row
-- under a lock, and writes the row and its audit event in one transaction.
-- Every function runs as its owner with an empty search_path and raises one of
-- these stable messages, which the client maps to plain language:
--   not_found, forbidden, already_claimed, invalid_transition,
--   not_cancellable, invalid_request

create function public.claim_incident(report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_responder() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_report from public.reports r where r.id = report_id for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if cardinality(v_report.assigned_responder_ids) > 0 then
    if auth.uid() = any (v_report.assigned_responder_ids) then
      return;
    end if;

    raise exception 'already_claimed' using errcode = 'P0001';
  end if;

  if v_report.incident_status <> 'new' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.reports r
  set assigned_responder_ids = array[auth.uid()],
      incident_status = 'acknowledged',
      acknowledged_at = now()
  where r.id = report_id;

  insert into public.report_events (report_id, type, from_status, to_status, actor_id, actor_role, note)
  values (report_id, 'status-change', 'new', 'acknowledged', auth.uid(), public.app_role(),
          'Claimed and acknowledged.');
end;
$$;

create function public.transition_incident(report_id uuid, to_status text, note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if not public.is_responder() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_report from public.reports r where r.id = report_id for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Acknowledging a new incident is a claim.
  if v_report.incident_status = 'new' and to_status = 'acknowledged' then
    perform public.claim_incident(report_id);
    return;
  end if;

  if not (auth.uid() = any (v_report.assigned_responder_ids) or public.is_reviewer()) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.incident_transitions t
    where t.from_status = v_report.incident_status and t.to_status = transition_incident.to_status
  ) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.reports r
  set incident_status = transition_incident.to_status,
      resolved_at = case when transition_incident.to_status = 'resolved' then now() else r.resolved_at end
  where r.id = report_id;

  insert into public.report_events (report_id, type, from_status, to_status, actor_id, actor_role, note)
  values (report_id, 'status-change', v_report.incident_status, transition_incident.to_status,
          auth.uid(), public.app_role(), left(btrim(coalesce(note, '')), 500));
end;
$$;

create function public.verify_incident(report_id uuid, verification_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  if verification_status not in ('verified', 'rejected') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  if not public.is_responder() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_report from public.reports r where r.id = report_id for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if not (auth.uid() = any (v_report.assigned_responder_ids) or public.is_reviewer()) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update public.reports r
  set verification_status = verify_incident.verification_status
  where r.id = report_id;

  insert into public.report_events (report_id, type, from_status, to_status, actor_id, actor_role)
  values (report_id, 'verification', v_report.verification_status,
          verify_incident.verification_status, auth.uid(), public.app_role());
end;
$$;

create function public.cancel_report(report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  select * into v_report from public.reports r where r.id = report_id for update;

  -- Someone else's report reads as missing rather than forbidden, so the
  -- answer does not confirm that it exists.
  if not found or v_report.reporter_id is distinct from auth.uid() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_report.incident_status not in ('new', 'acknowledged') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.reports r set incident_status = 'cancelled' where r.id = report_id;

  insert into public.report_events (report_id, type, from_status, to_status, actor_id, actor_role)
  values (report_id, 'status-change', v_report.incident_status, 'cancelled', auth.uid(),
          public.app_role());
end;
$$;

create function public.submit_application(
  organization text,
  badge_number text,
  municipality text,
  identity_document_path text,
  selfie_path text,
  consent_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select a.status into v_status
  from public.responder_applications a
  where a.applicant_id = auth.uid()
  for update;

  if v_status in ('pending', 'approved') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  -- A rejected application is replaced, so the applicant can try again.
  insert into public.responder_applications as a (
    applicant_id, organization, badge_number, municipality,
    identity_document_path, selfie_path, consent_version
  )
  values (
    auth.uid(), btrim(organization), btrim(badge_number), btrim(municipality),
    identity_document_path, selfie_path, consent_version
  )
  on conflict (applicant_id) do update
  set organization = excluded.organization,
      badge_number = excluded.badge_number,
      municipality = excluded.municipality,
      identity_document_path = excluded.identity_document_path,
      selfie_path = excluded.selfie_path,
      consent_version = excluded.consent_version,
      status = 'pending',
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      review_notes = '';
end;
$$;

create function public.decide_application(applicant_id uuid, approve boolean, notes text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_reviewer() or applicant_id = auth.uid() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select a.status into v_status
  from public.responder_applications a
  where a.applicant_id = decide_application.applicant_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_status <> 'pending' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  -- The evidence is deleted right after this commits, so the stored paths must
  -- not outlive the decision.
  update public.responder_applications a
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = left(btrim(coalesce(notes, '')), 1000),
      identity_document_path = null,
      selfie_path = null
  where a.applicant_id = decide_application.applicant_id;

  -- Approval never demotes someone who already holds a higher role.
  if approve then
    insert into public.role_assignments as ra (user_id, role, assigned_by)
    values (decide_application.applicant_id, 'responder', auth.uid())
    on conflict (user_id) do update
    set role = 'responder', assigned_by = excluded.assigned_by, assigned_at = now()
    where ra.role = 'resident';
  end if;
end;
$$;

create function public.set_role(user_id uuid, role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if role not in ('resident', 'responder', 'reviewer', 'admin') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;

  if not public.is_reviewer() or user_id = auth.uid() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users u where u.id = set_role.user_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select ra.role into v_current from public.role_assignments ra where ra.user_id = set_role.user_id;

  -- A reviewer moves people between resident and responder only; promoting to
  -- reviewer or admin, or changing a reviewer or admin, needs an admin.
  if not public.is_admin()
     and (role not in ('resident', 'responder')
          or coalesce(v_current, 'resident') not in ('resident', 'responder')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  insert into public.role_assignments as ra (user_id, role, assigned_by)
  values (set_role.user_id, set_role.role, auth.uid())
  on conflict on constraint role_assignments_pkey do update
  set role = excluded.role, assigned_by = excluded.assigned_by, assigned_at = now();
end;
$$;

create function public.incident_counts()
returns table (
  open_incidents integer,
  unclaimed integer,
  overdue integer,
  verified integer,
  awaiting_verification integer,
  counted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_responder() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Overdue uses the same 15 minute acknowledgement target as
  -- ACKNOWLEDGEMENT_TARGET_MS in incidentLifecycle.js.
  return query
  select
    count(*)::integer,
    count(*) filter (where cardinality(r.assigned_responder_ids) = 0)::integer,
    count(*) filter (where r.incident_status = 'new' and r.created_at < now() - interval '15 minutes')::integer,
    count(*) filter (where r.verification_status = 'verified')::integer,
    count(*) filter (where r.verification_status = 'pending')::integer,
    now()
  from public.reports r
  where r.incident_status in ('new', 'acknowledged', 'dispatched', 'on_scene');
end;
$$;

-- Server only: called by the partner API with the secret key.
create function public.ingest_signal(
  source text,
  external_id text,
  type text,
  level text,
  headline text,
  body text,
  areas jsonb,
  issued_at timestamptz,
  expires_at timestamptz,
  url text
)
returns table (signal_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_created boolean;
  v_municipality text;
begin
  insert into public.signals as s (
    source, external_id, type, level, headline, body, areas, issued_at, expires_at, url
  )
  values (
    ingest_signal.source, ingest_signal.external_id, ingest_signal.type, ingest_signal.level,
    ingest_signal.headline, ingest_signal.body, coalesce(ingest_signal.areas, '[]'),
    ingest_signal.issued_at, ingest_signal.expires_at, ingest_signal.url
  )
  on conflict on constraint signals_source_external_id_key do update
  set type = excluded.type,
      level = excluded.level,
      headline = excluded.headline,
      body = excluded.body,
      areas = excluded.areas,
      issued_at = excluded.issued_at,
      expires_at = excluded.expires_at,
      url = excluded.url
  returning s.id, (xmax = 0) into v_id, v_created;

  -- The feed item names a municipality only when the signal covers exactly one.
  select case when count(distinct a ->> 'municipality') = 1 then min(a ->> 'municipality') end
  into v_municipality
  from jsonb_array_elements(coalesce(ingest_signal.areas, '[]')) as a;

  insert into public.public_feed as f (kind, summary, municipality, source, signal_id, created_by, expires_at)
  values ('advisory', left(ingest_signal.headline, 240), v_municipality, ingest_signal.source, v_id,
          null, ingest_signal.expires_at)
  on conflict on constraint public_feed_signal_id_key do update
  set summary = excluded.summary,
      municipality = excluded.municipality,
      source = excluded.source,
      expires_at = excluded.expires_at;

  return query select v_id, v_created;
end;
$$;

revoke execute on function public.claim_incident(uuid) from public, anon;
revoke execute on function public.transition_incident(uuid, text, text) from public, anon;
revoke execute on function public.verify_incident(uuid, text) from public, anon;
revoke execute on function public.cancel_report(uuid) from public, anon;
revoke execute on function public.submit_application(text, text, text, text, text, text) from public, anon;
revoke execute on function public.decide_application(uuid, boolean, text) from public, anon;
revoke execute on function public.set_role(uuid, text) from public, anon;
revoke execute on function public.incident_counts() from public, anon;
revoke execute on function public.ingest_signal(text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text)
  from public, anon, authenticated;

grant execute on function public.claim_incident(uuid) to authenticated;
grant execute on function public.transition_incident(uuid, text, text) to authenticated;
grant execute on function public.verify_incident(uuid, text) to authenticated;
grant execute on function public.cancel_report(uuid) to authenticated;
grant execute on function public.submit_application(text, text, text, text, text, text) to authenticated;
grant execute on function public.decide_application(uuid, boolean, text) to authenticated;
grant execute on function public.set_role(uuid, text) to authenticated;
grant execute on function public.incident_counts() to authenticated;
grant execute on function public.ingest_signal(text, text, text, text, text, text, jsonb, timestamptz, timestamptz, text)
  to service_role;
