-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Bug fixes for schema drift.
-- Run AFTER all previous schema_*.sql files.
--
-- Fixes two errors caused by `create table if not exists` skipping NEW columns
-- and constraints on tables that existed from earlier drafts:
--   1. reports.type (and the other v6 columns) — missing → submit fails with
--      "Could not find the 'type' column of 'reports' in the schema cache".
--   2. attendance unique(org,user,event,date) — missing → recordAttendance's
--      upsert fails with "no unique or exclusion constraint matching the
--      ON CONFLICT specification".
--
-- Safe to re-run. Existing data is preserved (the reports fix backfills new
-- columns with sensible defaults; the attendance fix dedupes first so the
-- new constraint can be added cleanly).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) REPORTS — ensure every column from schema_v6.sql exists
-- ═══════════════════════════════════════════════════════════════════════════

-- type: defaults to 'activity' for any rows that existed before. The check
-- constraint runs against future rows too.
alter table public.reports
  add column if not exists type text not null default 'activity'
    check (type in ('activity', 'financial'));

-- status: defaults to 'pending' (matches DB default in schema_v6).
alter table public.reports
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

-- Reviewer-tracking columns — nullable, populated by the approve/reject flow.
alter table public.reports
  add column if not exists reviewed_at timestamptz;

alter table public.reports
  add column if not exists reviewed_by uuid
    references public.users(id) on delete set null;

alter table public.reports
  add column if not exists review_comment text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) ATTENDANCE — ensure the unique constraint exists
-- ═══════════════════════════════════════════════════════════════════════════

-- Without the unique constraint, duplicates may have slipped in. Dedupe first
-- (keep the oldest row per logical key, delete newer copies) so the next
-- `add constraint` succeeds. ctid is Postgres's internal row identifier;
-- lower ctid = inserted earlier.
delete from public.attendance a
using public.attendance b
where a.ctid > b.ctid
  and a.organization_id = b.organization_id
  and a.user_id = b.user_id
  and a.event_name = b.event_name
  and a.attended_date = b.attended_date;

-- Postgres has no "add constraint if not exists" — wrap in a DO block and
-- swallow the duplicate_object error so re-running is safe.
do $$
begin
  alter table public.attendance
    add constraint attendance_unique_per_event
    unique (organization_id, user_id, event_name, attended_date);
exception when duplicate_object then
  null; -- constraint already exists, nothing to do
end $$;
