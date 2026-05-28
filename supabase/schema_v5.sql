-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for moderation + tightened delete.
-- Run AFTER schema.sql + schema_v2.sql + schema_v3.sql + schema_v4.sql.
--
-- Two security changes:
--
-- 1) Announcements get a moderation workflow.
--    • New column: announcements.status ('pending' | 'approved' | 'rejected').
--    • Regular members can now SUBMIT announcements — they're inserted as
--      'pending' and stay hidden from other members until an adviser/faculty
--      coordinator approves them.
--    • Officer/adviser/faculty posts are auto-approved (status='approved' on
--      insert).
--    • Only adviser/faculty can moderate (approve/reject). Student officers
--      can post but cannot moderate other people's posts — kept narrow on
--      purpose so review power tracks the actual hierarchy.
--
-- 2) Creator-only delete (with adviser override) for posts and records.
--    Officer A can no longer delete Officer B's announcement, attendance
--    row, or financial record. Adviser/faculty coordinator keeps an override
--    so they can clean up after a removed officer.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Announcements: add status column ──────────────────────────────────────
-- Default 'approved' so existing rows (created before moderation existed)
-- remain visible. New rows have to specify it explicitly.
alter table public.announcements
  add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected'));

-- Faster lookups for the "show me approved posts" path (the common one) and
-- "show me pending posts to review" (the adviser queue).
create index if not exists announcements_org_status_idx
  on public.announcements(organization_id, status, posted_at desc);

-- ── 1a) Announcements: revised SELECT policy ─────────────────────────────────
-- Visibility rules:
--   • Approved post + caller is a member/adviser of the club → visible.
--   • Caller is the author → always visible (so submitters see their own
--     pending/rejected posts and any feedback).
--   • Pending post + caller is adviser/faculty of the club → visible (the
--     moderation queue).
drop policy if exists "members read announcements" on public.announcements;
create policy "members read announcements"
  on public.announcements for select
  to authenticated using (
    -- Author always sees their own (any status).
    posted_by = auth.uid()
    -- Approved + member or adviser of the club.
    or (
      status = 'approved'
      and (
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
      )
    )
    -- Pending + adviser/faculty (the moderation queue).
    or (
      status = 'pending'
      and exists (
        select 1 from public.organizations o
        where o.id = announcements.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
      )
    )
  );

-- ── 1b) Announcements: revised INSERT policy ─────────────────────────────────
-- Two paths, joined by OR:
--   • Officer/adviser/faculty posting as 'approved'. This is the existing
--     direct-post path.
--   • Regular member of the club posting as 'pending'. NEW path that enables
--     student submission.
-- In both cases posted_by must equal auth.uid() (no spoofing).
drop policy if exists "officers post announcements" on public.announcements;
create policy "members or officers post announcements"
  on public.announcements for insert
  to authenticated with check (
    posted_by = auth.uid()
    and (
      -- Path A: officer/adviser/faculty posting as 'approved'.
      (
        status = 'approved'
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
      )
      -- Path B: any club member submitting as 'pending'.
      or (
        status = 'pending'
        and exists (
          select 1 from public.memberships m
          where m.organization_id = announcements.organization_id
            and m.user_id = auth.uid()
        )
      )
    )
  );

-- ── 1c) Announcements: moderation UPDATE policy (adviser/faculty only) ───────
-- Only the adviser/faculty coordinator of the club can change a post's
-- status. Officers (even student officers) cannot moderate — by design.
drop policy if exists "advisers moderate announcements" on public.announcements;
create policy "advisers moderate announcements"
  on public.announcements for update
  to authenticated using (
    exists (
      select 1 from public.organizations o
      where o.id = announcements.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.organizations o
      where o.id = announcements.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── 2) Tightened DELETE policies (creator-only, adviser override) ────────────
-- Old policy: any officer/adviser of the club could delete any row.
-- New policy: only the row's author/recorder OR the adviser/faculty
--             coordinator can delete. So officer A can no longer wipe
--             officer B's post, attendance entry, or financial record.

-- Announcements: only the post's author or an adviser can delete.
drop policy if exists "officers delete announcements" on public.announcements;
create policy "author or adviser deletes announcements"
  on public.announcements for delete
  to authenticated using (
    posted_by = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.id = announcements.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- Attendance: only the row's recorder or an adviser can delete.
drop policy if exists "officers delete attendance" on public.attendance;
create policy "recorder or adviser deletes attendance"
  on public.attendance for delete
  to authenticated using (
    recorded_by = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.id = attendance.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- Financial records: only the row's recorder or an adviser can delete.
drop policy if exists "officers delete finances" on public.financial_records;
create policy "recorder or adviser deletes finances"
  on public.financial_records for delete
  to authenticated using (
    recorded_by = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.id = financial_records.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );
