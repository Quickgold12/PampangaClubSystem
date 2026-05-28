-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Faculty Coordinator school-wide oversight.
-- Run AFTER all previous schema_*.sql files.
--
-- Faculty coordinators are the school's oversight role. Until now their data
-- access (like advisers) was limited to clubs they're personally named on. The
-- "school-wide" dashboard features need them to READ activity across EVERY
-- club, so this adds school-wide SELECT policies gated on the user's app-wide
-- role being 'faculty_coordinator'.
--
-- These are ADDITIVE — Postgres OR's multiple permissive policies together, so
-- existing member/adviser policies are unchanged. Only READ is granted
-- school-wide; faculty coordinators still can't WRITE to clubs they don't
-- coordinate (no new insert/update/delete policies here).
--
-- organizations + memberships are already readable by any authenticated user,
-- so the school-wide member counts / club list work without changes. This file
-- only needs to open up the ACTIVITY tables used to detect inactive clubs:
-- announcements, events, attendance.
-- ─────────────────────────────────────────────────────────────────────────────

-- Small helper predicate repeated below: "current user is a faculty coordinator".
--   exists (select 1 from public.users u where u.id = auth.uid()
--           and u.role = 'faculty_coordinator')

drop policy if exists "faculty read all announcements" on public.announcements;
create policy "faculty read all announcements"
  on public.announcements for select
  to authenticated using (
    exists (select 1 from public.users u
      where u.id = auth.uid() and u.role = 'faculty_coordinator')
  );

drop policy if exists "faculty read all events" on public.events;
create policy "faculty read all events"
  on public.events for select
  to authenticated using (
    exists (select 1 from public.users u
      where u.id = auth.uid() and u.role = 'faculty_coordinator')
  );

drop policy if exists "faculty read all attendance" on public.attendance;
create policy "faculty read all attendance"
  on public.attendance for select
  to authenticated using (
    exists (select 1 from public.users u
      where u.id = auth.uid() and u.role = 'faculty_coordinator')
  );
