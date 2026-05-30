-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — QR attendance check-in.
-- Run AFTER schema_v26.sql.
--
-- Flow:
--   1. An officer/adviser opens "QR Check-In" for an event. The app inserts a
--      checkin_sessions row and renders its id as a QR code on screen.
--   2. A member scans the QR and the app calls the check_in() RPC with the
--      scanned session id. The RPC validates the session, confirms the caller
--      is a member of that club, and writes an attendance row for them — so QR
--      check-ins land in the SAME attendance table as manually-recorded ones
--      and show up in every existing attendance view.
--
-- Security model:
--   • The session id is an unguessable UUID — you can only check in if you can
--     see the QR (i.e. you're physically present), and sessions expire.
--   • check_in() is SECURITY DEFINER so it can insert attendance despite the
--     "officers only" insert policy, but it FIRST verifies club membership and
--     session validity, and hard-codes user_id := auth.uid(). A member can
--     therefore only ever check THEMSELVES in, and only to a club they belong
--     to, and only with a live session token.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 1 and 120),
  event_date date not null default current_date,
  created_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '2 hours',
  created_at timestamptz not null default now()
);

create index if not exists checkin_sessions_org_idx
  on public.checkin_sessions(organization_id, created_at desc);

alter table public.checkin_sessions enable row level security;

-- Officers/advisers/faculty of the club manage check-in sessions for it.
-- (Members never need to read the table directly — the RPC handles check-in.)
drop policy if exists "moderators manage checkin_sessions" on public.checkin_sessions;
create policy "moderators manage checkin_sessions"
  on public.checkin_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = checkin_sessions.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = checkin_sessions.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.organization_id = checkin_sessions.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = checkin_sessions.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── check_in RPC — member scans the QR, this records their attendance ───────
-- Returns the event name on success; raises a "checkin:"-prefixed error the
-- client turns into a friendly message otherwise.
create or replace function public.check_in(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.checkin_sessions where id = p_session_id;
  if not found then
    raise exception 'checkin: This QR code isn''t valid.';
  end if;
  if s.expires_at < now() then
    raise exception 'checkin: This check-in has expired. Ask an officer to start a new one.';
  end if;

  -- Caller must belong to the club.
  if not exists (
    select 1 from public.memberships m
    where m.organization_id = s.organization_id
      and m.user_id = auth.uid()
  ) then
    raise exception 'checkin: You''re not a member of this club.';
  end if;

  -- Record attendance for the caller. Idempotent: a second scan is a no-op.
  insert into public.attendance (organization_id, user_id, event_name, attended_date, recorded_by)
  values (s.organization_id, auth.uid(), s.event_name, s.event_date, auth.uid())
  on conflict (organization_id, user_id, event_name, attended_date) do nothing;

  return s.event_name;
end;
$$;

grant execute on function public.check_in(uuid) to authenticated;
