-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Chat message reporting (safety).
-- Run AFTER schema_v22.sql.
--
-- Lets any club member flag a chat message for adviser/faculty review. This is
-- a baseline safety feature for a student app: there must be a way to report
-- inappropriate content and a queue for staff to act on it.
--
-- Lifecycle:
--   pending  → a member flagged it, awaiting review
--   resolved → a reviewer kept the message (dismissed the report)
--   removed  → a reviewer deleted the offending message
--
-- RLS:
--   • Members of the club can INSERT a report (reporter forced to auth.uid()).
--   • A member can see their OWN reports.
--   • Officers/advisers/faculty coordinators of the club can see + update
--     reports for that club (the review queue).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reported_by uuid references public.users(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'removed')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz
);

-- The review queue reads "pending reports for clubs I moderate, newest first".
create index if not exists message_reports_org_status_idx
  on public.message_reports(organization_id, status, created_at desc);

alter table public.message_reports enable row level security;

-- Helper predicate, inlined per policy: caller moderates this club if they are
-- an officer member OR the named adviser / faculty coordinator.

-- ── members file a report ────────────────────────────────────────────────────
drop policy if exists "members report messages" on public.message_reports;
create policy "members report messages"
  on public.message_reports for insert
  to authenticated with check (
    reported_by = auth.uid()
    and (
      exists (
        select 1 from public.memberships m
        where m.organization_id = message_reports.organization_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.organizations o
        where o.id = message_reports.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
      )
    )
  );

-- ── read: own reports, or any report for a club you moderate ─────────────────
drop policy if exists "read own or moderated message reports" on public.message_reports;
create policy "read own or moderated message reports"
  on public.message_reports for select
  to authenticated using (
    reported_by = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.organization_id = message_reports.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = message_reports.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── moderators resolve/remove reports ────────────────────────────────────────
drop policy if exists "moderators update message reports" on public.message_reports;
create policy "moderators update message reports"
  on public.message_reports for update
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = message_reports.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = message_reports.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  ) with check (true);
