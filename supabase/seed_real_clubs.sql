-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Real club seed for Pampanga High School.
-- Run in the Supabase SQL Editor.
--
-- What this does:
--   1. Wipes ALL existing organizations (cascades to memberships, attendance,
--      announcements, finances, dues, budgets, reports, events). Test data
--      from earlier seeds is removed; user accounts (auth.users + public.users)
--      are NOT touched.
--   2. Inserts the 28 PHS clubs.
--
-- All clubs are created with:
--   • Empty description — faculty / advisers can fill these in via the app's
--     "Edit Club" flow (faculty coordinator can update from "Manage All Clubs").
--   • No adviser / faculty coordinator assigned yet — set via the faculty
--     console's "Assign Adviser" modal once advisers have signed up.
--
-- Re-running is safe: the DELETE at the top clears prior data first.
-- ─────────────────────────────────────────────────────────────────────────────

-- Wipe existing clubs and everything that hangs off them (FK cascades).
delete from public.organizations;

-- Insert the 28 PHS clubs.
insert into public.organizations (name, description) values
  ('PHSSSLGO',                                                ''),
  ('Agri-Fishery Arts Club',                                  ''),
  ('Araling Panlipunan Club',                                 ''),
  ('Barkada Kontra Droga',                                    ''),
  ('Boy Scout of the Philippines',                            ''),
  ('Campus Youth Ministry',                                   ''),
  ('English Club',                                            ''),
  ('Filipino Club',                                           ''),
  ('Future Homemakers of the Philippines Club',               ''),
  ('Girl Scout of the Philippines',                           ''),
  ('Helping Hands Club',                                      ''),
  ('Industrial Arts Club',                                    ''),
  ('Information, Communication, and Technology Club',         ''),
  ('Library Club',                                            ''),
  ('Makulay Club',                                            ''),
  ('MAPEH Club',                                              ''),
  ('Math Club',                                               ''),
  ('PAPEL Club (disbanded)',                                  'Currently disbanded.'),
  ('Research Club',                                           ''),
  ('Science Club',                                            ''),
  ('SNED Club',                                               ''),
  ('Special Program for Arts Club',                           ''),
  ('Sports Club',                                             ''),
  ('STREM Club',                                              ''),
  ('Teen Doctors and Nurses Club',                            ''),
  ('Values Club',                                             ''),
  ('Visual Arts Club',                                        ''),
  ('YES Organization',                                        '');

-- Verify count — should print 28.
do $$
declare
  c int;
begin
  select count(*) into c from public.organizations;
  raise notice 'organizations row count: %', c;
end $$;
