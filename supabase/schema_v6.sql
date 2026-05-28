-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for Report Submission & Approval.
-- Run AFTER schema.sql, schema_v2.sql, schema_v3.sql, schema_v4.sql, schema_v5.sql.
--
-- New table:
--   • reports — formal write-ups submitted by officers (activity reports,
--               financial reports) that need adviser/faculty approval before
--               they're considered official.
--
-- RLS:
--   • SELECT  → club members + advisers (everyone in the club sees the audit
--               trail). Pending/rejected reports also visible to the submitter.
--   • INSERT  → officer/adviser/faculty of the club (regular members cannot
--               submit reports). submitted_by forced to auth.uid().
--   • UPDATE  → adviser/faculty ONLY (approve/reject). Student officers
--               cannot moderate other officers' submissions.
--   • DELETE  → the original submitter OR adviser/faculty (matches the
--               creator-only delete rule from schema_v5.sql).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── reports ──────────────────────────────────────────────────────────────────
-- `type` separates activity from financial reports — the UI uses this to
-- pick the right icon/colour and filter the list.
-- `status` mirrors the announcement lifecycle: pending → approved/rejected.
-- `review_comment` is optional adviser feedback on the decision (rejection
-- reasons, etc).
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references public.users(id) on delete set null,
  type text not null check (type in ('activity', 'financial')),
  title text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  review_comment text
);

-- The two common queries — "list reports for this club newest first" and
-- "give me pending reports for the approval queue" — both benefit from the
-- same composite index.
create index if not exists reports_org_status_idx
  on public.reports(organization_id, status, submitted_at desc);

alter table public.reports enable row level security;

-- ── SELECT: members + advisers see club reports; author sees own pending ─────
drop policy if exists "members read reports" on public.reports;
create policy "members read reports"
  on public.reports for select
  to authenticated using (
    -- Author always sees their own (any status).
    submitted_by = auth.uid()
    -- Club members and adviser/faculty see all reports for the club. We
    -- include all statuses here because reports are an audit trail — even
    -- rejected ones should be visible so members understand outcomes.
    or exists (
      select 1 from public.memberships m
      where m.organization_id = reports.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations o
      where o.id = reports.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── INSERT: officer/adviser/faculty only; submitted_by must equal auth.uid() ─
-- Regular student members cannot submit reports — by design. A report is a
-- formal submission with the club's name behind it, so it stays gated to
-- people who hold a leadership role for the club.
drop policy if exists "officers submit reports" on public.reports;
create policy "officers submit reports"
  on public.reports for insert
  to authenticated with check (
    submitted_by = auth.uid()
    and (
      exists (
        select 1 from public.memberships m
        where m.organization_id = reports.organization_id
          and m.user_id = auth.uid()
          and m.role_in_club = 'officer'
      )
      or exists (
        select 1 from public.organizations o
        where o.id = reports.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
      )
    )
  );

-- ── UPDATE: adviser/faculty ONLY (the approve/reject action) ─────────────────
-- Student officers can submit but cannot rubber-stamp their own (or each
-- other's) reports. Matches the announcement moderation model.
drop policy if exists "advisers moderate reports" on public.reports;
create policy "advisers moderate reports"
  on public.reports for update
  to authenticated using (
    exists (
      select 1 from public.organizations o
      where o.id = reports.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.organizations o
      where o.id = reports.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── DELETE: original submitter or adviser/faculty ────────────────────────────
-- Matches the creator-only-with-adviser-override pattern from schema_v5.sql.
-- An officer cannot delete another officer's report.
drop policy if exists "submitter or adviser deletes reports" on public.reports;
create policy "submitter or adviser deletes reports"
  on public.reports for delete
  to authenticated using (
    submitted_by = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.id = reports.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );
