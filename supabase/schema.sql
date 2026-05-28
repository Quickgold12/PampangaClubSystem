-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Supabase schema for Club Discovery & Registration.
-- Paste this into the Supabase SQL editor (one section at a time is fine).
--
-- Tables created here:
--   • organizations  — one row per club (already implied by the existing app)
--   • memberships    — who belongs to which club, and as what (member vs officer)
--   • join_requests  — student-initiated requests waiting for officer/adviser action
--
-- The `users` table is assumed to already exist (created during signup) with at
-- minimum: id (uuid, PK = auth.users.id), full_name (text), role (text), email (text).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── organizations ────────────────────────────────────────────────────────────
-- One row per club. adviser_id / faculty_coordinator_id point at users.id.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  adviser_id uuid references public.users(id) on delete set null,
  faculty_coordinator_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── memberships ──────────────────────────────────────────────────────────────
-- A student appears here once they've been approved into a club. `role_in_club`
-- separates regular members from student officers (officers can approve requests).
-- The unique constraint blocks the same user from joining the same club twice.
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_in_club text not null default 'member' check (role_in_club in ('member', 'officer')),
  joined_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index if not exists memberships_org_idx on public.memberships(organization_id);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- ── join_requests ────────────────────────────────────────────────────────────
-- Student-created rows that an officer/adviser later approves or rejects.
-- The partial unique index prevents a student from spamming multiple PENDING
-- requests against the same club (resolved requests don't count, so a student
-- can re-apply after being rejected).
create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  message text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null
);

create unique index if not exists join_requests_one_pending_per_user_org
  on public.join_requests(user_id, organization_id)
  where status = 'pending';

create index if not exists join_requests_org_status_idx
  on public.join_requests(organization_id, status);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Minimal RLS so the mobile client can read clubs and create its own requests.
-- Tighten these later for production (e.g. only approved members can read each
-- other's profiles, only officers/advisers can update join_requests, etc).
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.join_requests enable row level security;

-- Note: Supabase Postgres doesn't accept `create policy if not exists`, so
-- every policy below uses drop-then-create. Re-running this file is safe.

-- Anyone signed in can browse clubs.
drop policy if exists "orgs are readable by authenticated users" on public.organizations;
create policy "orgs are readable by authenticated users"
  on public.organizations for select
  to authenticated using (true);

-- Anyone signed in can see who is in which club (for the detail screen).
drop policy if exists "memberships are readable by authenticated users" on public.memberships;
create policy "memberships are readable by authenticated users"
  on public.memberships for select
  to authenticated using (true);

-- A student can read their own join requests; officers/advisers can read the
-- requests for clubs they belong to.
drop policy if exists "students read own requests" on public.join_requests;
create policy "students read own requests"
  on public.join_requests for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "officers read requests for their clubs" on public.join_requests;
create policy "officers read requests for their clubs"
  on public.join_requests for select
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = join_requests.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = join_requests.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- A signed-in user can create a request for themselves.
drop policy if exists "users create own requests" on public.join_requests;
create policy "users create own requests"
  on public.join_requests for insert
  to authenticated with check (auth.uid() = user_id);

-- Officers / advisers can update (approve/reject) requests for their clubs.
drop policy if exists "officers update requests for their clubs" on public.join_requests;
create policy "officers update requests for their clubs"
  on public.join_requests for update
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = join_requests.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = join_requests.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- Only officers/advisers can insert memberships (the approve flow does this).
drop policy if exists "officers insert memberships" on public.memberships;
create policy "officers insert memberships"
  on public.memberships for insert
  to authenticated with check (
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
