-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Dashboard add-ons: scheduled events.
-- Run AFTER all previous schema_*.sql files.
--
-- Adds an `events` table for SCHEDULED (future or past) club events. This is
-- distinct from `attendance`, which records who actually showed up. An event is
-- the plan ("Quarterly General Assembly, May 30"); attendance is the record of
-- who attended an event that already happened.
--
-- Powers three dashboard add-ons:
--   • Event/activity calendar (per-club agenda of upcoming + past events)
--   • Upcoming events widget (home dashboard, across the user's clubs)
--   • Club statistics are computed from attendance + memberships (no new table)
--
-- RLS: members read; officers/advisers/faculty create + delete (creator-or-
-- adviser delete, same rule as the rest of the app).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  location text,
  event_date date not null,
  -- Free-text time ("3:00 PM") to keep entry simple — no timezone math needed
  -- for a school calendar. Optional.
  event_time text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The common queries — "this club's events by date" and "upcoming events" —
-- both scan by (org, date).
create index if not exists events_org_date_idx
  on public.events(organization_id, event_date);

alter table public.events enable row level security;

-- ── members read events ──────────────────────────────────────────────────────
drop policy if exists "members read events" on public.events;
create policy "members read events"
  on public.events for select
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = events.organization_id and m.user_id = auth.uid())
    or exists (select 1 from public.organizations o
      where o.id = events.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

-- ── officers create events ───────────────────────────────────────────────────
drop policy if exists "officers create events" on public.events;
create policy "officers create events"
  on public.events for insert
  to authenticated with check (
    created_by = auth.uid()
    and (
      exists (select 1 from public.memberships m
        where m.organization_id = events.organization_id and m.user_id = auth.uid()
          and m.role_in_club = 'officer')
      or exists (select 1 from public.organizations o
        where o.id = events.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
    )
  );

-- ── creator or adviser deletes events ────────────────────────────────────────
drop policy if exists "creator or adviser deletes events" on public.events;
create policy "creator or adviser deletes events"
  on public.events for delete
  to authenticated using (
    created_by = auth.uid()
    or exists (select 1 from public.organizations o
      where o.id = events.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );
