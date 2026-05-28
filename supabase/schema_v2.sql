-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for Membership Management + Attendance.
-- Run AFTER supabase/schema.sql.
--
-- New table:
--   • attendance — one row per (user, event) marking that the user was present.
--
-- New / replaced policies:
--   • memberships:  officers/advisers can DELETE and UPDATE rows in their clubs
--                   (so we can remove members and promote/demote officers).
--   • attendance:   members read their own + officers/advisers read all for
--                   their club; officers/advisers insert; officers/advisers delete.
--
-- All `create policy` blocks use drop-then-create because Supabase's Postgres
-- doesn't accept `create policy if not exists`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── attendance ───────────────────────────────────────────────────────────────
-- One row = "user X was present at event Y of org Z on date D". `event_name`
-- + `attended_date` together identify the event (no separate events table —
-- keeps things simple for school-scale data).
-- The unique constraint blocks accidentally marking the same person twice for
-- the same event on the same day.
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  event_name text not null,
  attended_date date not null,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, event_name, attended_date)
);

-- Belt-and-braces: `create table if not exists` skips adding new columns to
-- an already-existing table, so the explicit `alter table` below upgrades
-- older databases that were created before `recorded_by` was part of the
-- schema. No-op on fresh installs.
alter table public.attendance
  add column if not exists recorded_by uuid references public.users(id) on delete set null;

-- Used by the "events history" query (group by event, newest first).
create index if not exists attendance_org_date_idx
  on public.attendance(organization_id, attended_date desc);

-- Used by the per-member summary (how many events has this user attended).
create index if not exists attendance_org_user_idx
  on public.attendance(organization_id, user_id);

alter table public.attendance enable row level security;

-- ── membership write policies (delete + update) ──────────────────────────────
-- Read policy was added in schema.sql. These two let officers/advisers REMOVE
-- members from the club and promote regular members to officers (and back).
drop policy if exists "officers delete memberships" on public.memberships;
create policy "officers delete memberships"
  on public.memberships for delete
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = memberships.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = memberships.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

drop policy if exists "officers update memberships" on public.memberships;
create policy "officers update memberships"
  on public.memberships for update
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = memberships.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = memberships.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── attendance policies ──────────────────────────────────────────────────────
-- Members of the club can read their own attendance + the full roster for
-- events of clubs they belong to (the summary view).
drop policy if exists "members read attendance" on public.attendance;
create policy "members read attendance"
  on public.attendance for select
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = attendance.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations o
      where o.id = attendance.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- Officers/advisers can record (insert) attendance.
drop policy if exists "officers insert attendance" on public.attendance;
create policy "officers insert attendance"
  on public.attendance for insert
  to authenticated with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = attendance.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = attendance.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- Officers/advisers can delete attendance (fix a wrong mark).
drop policy if exists "officers delete attendance" on public.attendance;
create policy "officers delete attendance"
  on public.attendance for delete
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = attendance.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = attendance.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── users update policy ──────────────────────────────────────────────────────
-- Let a signed-in user edit their OWN profile row (currently used to change
-- the displayed name). Email and role are not editable through this policy
-- because they're managed elsewhere (email by Supabase Auth, role at signup).
drop policy if exists "users update own row" on public.users;
create policy "users update own row"
  on public.users for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);
