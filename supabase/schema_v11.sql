-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — enable Realtime for in-app notifications.
-- Run AFTER all previous schema_*.sql files.
--
-- The app subscribes to Postgres changes on these tables to fire LOCAL device
-- notifications while it's open/backgrounded (see
-- src/services/notifications.service.ts):
--   • announcements  (INSERT) → "New announcement" to club members
--   • reports        (UPDATE) → "Your report was approved/rejected" to submitter
--   • join_requests  (UPDATE) → "You've been accepted" to the requester
--
-- Realtime still respects RLS: each subscriber only receives change events for
-- rows they're allowed to SELECT. So a member only hears about announcements in
-- their own clubs, a submitter only about their own reports, etc. — no extra
-- security work needed beyond the policies already in place.
--
-- This just adds the tables to the `supabase_realtime` publication. Wrapped in
-- guards so re-running is safe (adding an already-published table errors).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'join_requests'
  ) then
    alter publication supabase_realtime add table public.join_requests;
  end if;
end $$;
