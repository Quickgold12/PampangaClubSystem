-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — fix members not appearing for other signed-in users.
-- Run AFTER all previous schema_*.sql files.
--
-- The bug:
--   The original `public.users` SELECT policy was "users read own row"
--   (auth.uid() = id). That meant whenever the app joined users from another
--   table (memberships, announcements, reports, attendance, financial_records,
--   join_requests), the join would succeed but the user's profile row would
--   be filtered out for everyone except the user themselves. The services
--   then dropped rows whose joined user was null, which made:
--     • a club's Members list appear empty to anyone but the member
--     • announcement authors render as "Unknown" for everyone but themselves
--     • report submitter/reviewer names disappear for non-self viewers
--     • attendance attendee names disappear from event rosters
--
-- The fix:
--   Replace the policy so any signed-in user can read every user's basic
--   profile row. In a school club context, names/roles/emails of fellow
--   members aren't secrets — and the existing flows (Add Member by Email,
--   Members list, author bylines) all rely on this being readable.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop both the OLD name (from the first run) and the NEW name (in case this
-- file is being re-run) so the create below always lands cleanly.
drop policy if exists "users read own row" on public.users;
drop policy if exists "users readable by authenticated" on public.users;
create policy "users readable by authenticated"
  on public.users for select
  to authenticated using (true);

-- The "users update own row" + "users insert own row" policies from earlier
-- stay unchanged — you can only modify/insert YOUR OWN profile, but anyone
-- signed in can READ profiles.
