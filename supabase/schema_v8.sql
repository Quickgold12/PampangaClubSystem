-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for in-app Club Creation.
-- Run AFTER all previous schema_*.sql files.
--
-- Until now, clubs (organizations) could only be created with raw SQL — there
-- was a SELECT policy but no INSERT/UPDATE policy, so the app could never make
-- one. This adds:
--
--   • INSERT → advisers and faculty coordinators (app-wide role) can create
--              clubs. The creator names themselves on the row as the relevant
--              role (handled in the service), but the policy only checks that
--              the caller holds a leadership role at all.
--   • UPDATE → the club's own adviser or faculty coordinator can edit its
--              details (name/description). Other users cannot.
--
-- DELETE of organizations is intentionally NOT exposed to the app — removing a
-- whole club (and cascading its members/finances/etc) is a destructive admin
-- action that should stay manual for now.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── INSERT: advisers / faculty coordinators can create clubs ─────────────────
-- We check the caller's app-wide role from public.users. Students (member or
-- officer) cannot create clubs — club creation is a leadership action.
drop policy if exists "advisers create organizations" on public.organizations;
create policy "advisers create organizations"
  on public.organizations for insert
  to authenticated with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.role in ('adviser', 'faculty_coordinator')
    )
  );

-- ── UPDATE: a club's adviser/faculty coordinator can edit it ─────────────────
-- Scoped to the specific club — only the people named on the org row can change
-- its name/description. Keeps one adviser from editing another club's details.
drop policy if exists "adviser updates own organization" on public.organizations;
create policy "adviser updates own organization"
  on public.organizations for update
  to authenticated using (
    adviser_id = auth.uid() or faculty_coordinator_id = auth.uid()
  ) with check (
    adviser_id = auth.uid() or faculty_coordinator_id = auth.uid()
  );
