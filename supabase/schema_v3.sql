-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for Announcements.
-- Run AFTER supabase/schema.sql and supabase/schema_v2.sql.
--
-- New table:
--   • announcements — posts authored by an officer/adviser, broadcast to all
--                     members of one club.
--
-- New column on existing table:
--   • memberships.last_read_announcements_at — timestamp the member last
--     visited the announcements screen for their club. Anything posted after
--     that timestamp is considered "new" for the unread badge.
--
-- New RLS:
--   • announcements:  members read all rows for clubs they belong to;
--                     officers/advisers insert + delete.
--   • memberships:    each user can update THEIR OWN row (specifically to
--                     bump last_read_announcements_at when they open
--                     the announcements screen). The existing officer
--                     update policy still allows promote/demote.
--
-- All `create policy` blocks use drop-then-create — re-running is safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── announcements ────────────────────────────────────────────────────────────
-- One row per post. `posted_by` is the author's user id; `posted_at` defaults
-- to now() so the client doesn't need to send the timestamp.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  posted_by uuid not null references public.users(id) on delete set null,
  title text not null,
  content text not null,
  posted_at timestamptz not null default now()
);

-- Most queries are "give me the latest announcements for org X" — this index
-- makes that a single index scan instead of a sort over the whole table.
create index if not exists announcements_org_posted_idx
  on public.announcements(organization_id, posted_at desc);

alter table public.announcements enable row level security;

-- ── last_read tracking on memberships ────────────────────────────────────────
-- Add the column if it isn't already there. Default to now() so existing
-- members don't suddenly see every historical announcement as "new".
alter table public.memberships
  add column if not exists last_read_announcements_at timestamptz not null default now();

-- ── members read announcements ───────────────────────────────────────────────
-- A user can read announcements for a club they actually belong to. Advisers
-- and faculty coordinators can read their clubs even if they don't have a
-- memberships row (they're named directly on the organization).
drop policy if exists "members read announcements" on public.announcements;
create policy "members read announcements"
  on public.announcements for select
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations o
      where o.id = announcements.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── officers post announcements ──────────────────────────────────────────────
-- Only student officers, advisers, and faculty coordinators of the club can
-- create posts. `posted_by` is forced to auth.uid() so users can't spoof the
-- author.
drop policy if exists "officers post announcements" on public.announcements;
create policy "officers post announcements"
  on public.announcements for insert
  to authenticated with check (
    posted_by = auth.uid()
    and (
      exists (
        select 1 from public.memberships m
        where m.organization_id = announcements.organization_id
          and m.user_id = auth.uid()
          and m.role_in_club = 'officer'
      )
      or exists (
        select 1 from public.organizations o
        where o.id = announcements.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
      )
    )
  );

-- ── officers delete announcements ────────────────────────────────────────────
-- Same set as insert: officers/advisers can remove a post (useful for fixing
-- typos by deleting + reposting since we don't expose an edit flow yet).
drop policy if exists "officers delete announcements" on public.announcements;
create policy "officers delete announcements"
  on public.announcements for delete
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = announcements.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = announcements.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── members update their OWN membership row ──────────────────────────────────
-- Needed so the app can bump `last_read_announcements_at` when the user opens
-- the announcements screen. The existing "officers update memberships" policy
-- already covers promote/demote — this one strictly covers "user updating
-- their own row" (e.g. read receipts).
drop policy if exists "members update own membership" on public.memberships;
create policy "members update own membership"
  on public.memberships for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
