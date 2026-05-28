-- ─────────────────────────────────────────────────────────────────────────────
-- Sample club seed — creates one fully-populated club for testing.
--
-- What this creates (all owned by YOU as the adviser + officer):
--   • 1 organization: "Computer Club"
--   • 1 membership row putting you in the club as an officer
--   • 4 announcements (with realistic dates spanning the last 2 weeks)
--   • 6 financial transactions (mix of income + expense)
--   • 3 attendance events (with you marked present)
--
-- Re-running is safe — the DO block deletes any prior "Computer Club" row
-- first, and the cascades clean up its memberships/announcements/finances/
-- attendance automatically.
--
-- 1) Change the v_email value below to the email you signed up with.
-- 2) Paste the whole block into the Supabase SQL Editor.
-- 3) Run.
-- 4) Hard-reload the app → Clubs tab → tap Computer Club.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  -- ⚠️ CHANGE THIS to the email you signed up with.
  v_email text := 'moraudas1@gmail.com';

  v_user_id uuid;
  v_org_id uuid;
begin
  -- Look up the user. Fail loudly if the email doesn't match a signup row.
  select id into v_user_id from public.users where email = v_email;
  if v_user_id is null then
    raise exception 'No user found in public.users with email %. Sign up first, then re-run.', v_email;
  end if;

  -- Wipe any prior "Computer Club" so this script is re-runnable. FK cascades
  -- clean up memberships, announcements, financial_records, attendance, and
  -- join_requests automatically.
  delete from public.organizations where name = 'Computer Club';

  -- Create the club. You are the adviser so the officer-only actions unlock.
  insert into public.organizations (name, description, adviser_id)
  values (
    'Computer Club',
    'Build websites, mobile apps, and small games. Weekly meetings every Friday at 4 PM in the computer lab.',
    v_user_id
  )
  returning id into v_org_id;

  -- Add you as an OFFICER membership row. You're already adviser, but having
  -- the membership row too makes you appear in the Members list and lets the
  -- "officer" UI gates light up consistently.
  insert into public.memberships (user_id, organization_id, role_in_club)
  values (v_user_id, v_org_id, 'officer');

  -- ── Announcements ──────────────────────────────────────────────────────
  -- Spread across the last 2 weeks so the timeline looks alive.
  insert into public.announcements (organization_id, posted_by, title, content, posted_at)
  values
    (v_org_id, v_user_id,
      'Welcome to Computer Club!',
      'Glad to have everyone on board. This is the first announcement — drop by Friday at 4 PM in the computer lab for our kickoff.',
      now() - interval '12 days'),
    (v_org_id, v_user_id,
      'Bring your laptop next meeting',
      'We''ll be setting up VS Code and Git accounts together. If you don''t have a laptop, no worries — we have spares.',
      now() - interval '7 days'),
    (v_org_id, v_user_id,
      'Membership dues collection',
      'Dues for the semester are ₱150. Pay your officer this week so we can buy components for the workshop.',
      now() - interval '3 days'),
    (v_org_id, v_user_id,
      'Workshop: building a personal site',
      'This Friday we''ll be building a one-page personal website from scratch. Beginners welcome.',
      now() - interval '1 day');

  -- ── Financial records ──────────────────────────────────────────────────
  -- Realistic mix: dues + donation as income, supplies/snacks/venue as expense.
  -- Net = 1500 + 500 - (450 + 320 + 600 + 180) = 450 (positive balance).
  insert into public.financial_records (organization_id, type, category, amount, description, recorded_by, record_date)
  values
    (v_org_id, 'income',  'Membership Dues', 1500.00, '10 members × ₱150',                v_user_id, current_date - 10),
    (v_org_id, 'income',  'Donation',         500.00, 'From alumnus J. Cruz',             v_user_id, current_date - 8),
    (v_org_id, 'expense', 'Supplies',         450.00, 'Arduino starter kit',              v_user_id, current_date - 7),
    (v_org_id, 'expense', 'Refreshments',     320.00, 'Snacks for kickoff meeting',       v_user_id, current_date - 6),
    (v_org_id, 'expense', 'Venue',            600.00, 'Audio-visual room reservation',    v_user_id, current_date - 4),
    (v_org_id, 'expense', 'Supplies',         180.00, 'Whiteboard markers + cables',      v_user_id, current_date - 2);

  -- ── Attendance ─────────────────────────────────────────────────────────
  -- Three past events, you marked present at each. Unique constraint blocks
  -- duplicates, so re-running is fine after the org wipe above.
  insert into public.attendance (organization_id, user_id, event_name, attended_date, recorded_by)
  values
    (v_org_id, v_user_id, 'Kickoff Meeting',      current_date - 12, v_user_id),
    (v_org_id, v_user_id, 'Git & VS Code Setup',  current_date - 5,  v_user_id),
    (v_org_id, v_user_id, 'Personal Site Build',  current_date - 1,  v_user_id);

  raise notice 'Sample club seeded. Open the Clubs tab and tap "Computer Club".';
end $$;
