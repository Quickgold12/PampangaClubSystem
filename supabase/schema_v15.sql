-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Edit flows + faculty cross-club admin.
-- Run AFTER all previous schema_*.sql files.
--
-- Adds three things:
--   1. Authors can EDIT their own announcements + reports (title/content), but
--      a BEFORE-UPDATE trigger blocks any unauthorised status change so authors
--      can't approve themselves. Only adviser/faculty can change status, as
--      before.
--   2. Faculty coordinators can UPDATE any organization row — needed for
--      "assign an adviser to a club" from the Manage All Clubs screen.
--
-- All policies use drop-then-create so the file is re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) AUTHOR EDITS — announcements
-- ═══════════════════════════════════════════════════════════════════════════

-- Permissive policy: an author can update their own announcement row.
-- (Other update policies — like "advisers moderate announcements" — still
-- apply via the OR-combining of permissive policies.)
drop policy if exists "author updates own announcement" on public.announcements;
create policy "author updates own announcement"
  on public.announcements for update
  to authenticated using (posted_by = auth.uid())
  with check (posted_by = auth.uid());

-- Trigger guard: prevent the author from sneakily flipping status. Only
-- adviser/faculty of the club can change status. Runs on every UPDATE.
create or replace function public.announcements_block_status_spoofing()
returns trigger
language plpgsql
security invoker
as $$
begin
  if NEW.status is distinct from OLD.status then
    if not exists (
      select 1 from public.organizations o
      where o.id = NEW.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    ) then
      raise exception 'Only adviser or faculty coordinator can change announcement status';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_announcements_status_guard on public.announcements;
create trigger trg_announcements_status_guard
  before update on public.announcements
  for each row execute function public.announcements_block_status_spoofing();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) AUTHOR EDITS — reports
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "submitter updates own report" on public.reports;
create policy "submitter updates own report"
  on public.reports for update
  to authenticated using (submitted_by = auth.uid())
  with check (submitted_by = auth.uid());

-- Same status-guard story as announcements. Also blocks tampering with the
-- review_comment / reviewed_at / reviewed_by columns by non-advisers.
create or replace function public.reports_block_status_spoofing()
returns trigger
language plpgsql
security invoker
as $$
declare
  is_adviser boolean;
begin
  is_adviser := exists (
    select 1 from public.organizations o
    where o.id = NEW.organization_id
      and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
  );

  if NEW.status is distinct from OLD.status and not is_adviser then
    raise exception 'Only adviser or faculty coordinator can change report status';
  end if;
  -- Reviewer-only fields: also locked from the submitter.
  if NEW.reviewed_by is distinct from OLD.reviewed_by and not is_adviser then
    raise exception 'Only adviser or faculty coordinator can set reviewed_by';
  end if;
  if NEW.reviewed_at is distinct from OLD.reviewed_at and not is_adviser then
    raise exception 'Only adviser or faculty coordinator can set reviewed_at';
  end if;
  if NEW.review_comment is distinct from OLD.review_comment and not is_adviser then
    raise exception 'Only adviser or faculty coordinator can set review_comment';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_reports_review_guard on public.reports;
create trigger trg_reports_review_guard
  before update on public.reports
  for each row execute function public.reports_block_status_spoofing();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) FACULTY can UPDATE any organization (for assign-adviser admin)
-- ═══════════════════════════════════════════════════════════════════════════

-- Existing policy "adviser updates own organization" stays. This ADDS a path
-- so faculty coordinators can update ANY club (e.g. to assign/change its
-- adviser). Faculty is the school's super-admin role for clubs.
drop policy if exists "faculty updates any organization" on public.organizations;
create policy "faculty updates any organization"
  on public.organizations for update
  to authenticated using (
    exists (select 1 from public.users u
      where u.id = auth.uid() and u.role = 'faculty_coordinator')
  ) with check (
    exists (select 1 from public.users u
      where u.id = auth.uid() and u.role = 'faculty_coordinator')
  );
