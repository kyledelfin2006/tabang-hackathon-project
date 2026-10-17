-- The partner incident listing orders by last change, then id, and filters by
-- status (GET /api/v1/incidents).
create index reports_updated_idx on public.reports (updated_at, id);
