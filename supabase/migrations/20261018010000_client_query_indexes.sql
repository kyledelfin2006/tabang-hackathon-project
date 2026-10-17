-- Indexes for the queries added in plan phase 5.

-- A responder's own advisories, newest first, on /responder/advisories.
create index public_feed_created_by_idx on public.public_feed (created_by, created_at desc);
