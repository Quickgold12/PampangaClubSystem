-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — server-side signup handler.
-- Run AFTER all previous schema_*.sql files.
--
-- Solves the recurring "duplicate key value violates unique constraint
-- users_email_key" error during signup by moving profile-row creation to a
-- Postgres trigger that fires on auth.users INSERT.
--
-- Why this works where client-side INSERT didn't:
--   • Runs server-side with SECURITY DEFINER (postgres role), so it can
--     DELETE orphan public.users rows that the calling client could never
--     touch (RLS blocks regular users from deleting other rows).
--   • Fires regardless of session state, so it works whether email
--     confirmation is on or off.
--   • Wrapped in EXCEPTION block — if anything goes wrong creating the
--     profile, the auth user is still created, the client gets a successful
--     signUp response, and the worst case is a missing profile that the app
--     can recover from on next login.
--
-- After running this file, the client should:
--   1. Pass full_name + role via supabase.auth.signUp options.data
--   2. Stop doing its own INSERT into public.users (already done in
--      auth.service.ts; see that file).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_role text;
begin
  -- Resolve full_name: client metadata → email prefix → literal 'User'. Never
  -- empty (so the dashboard never has to show "Hello" as a fallback).
  v_full_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1),
    'User'
  );

  -- Resolve role: must be one of the known values. Falls back to
  -- 'student_member' if missing or invalid — never lets a bad enum value
  -- through the role CHECK constraint.
  v_role := coalesce(new.raw_user_meta_data->>'role', 'student_member');
  if v_role not in ('student_member', 'club_officer', 'adviser', 'faculty_coordinator') then
    v_role := 'student_member';
  end if;

  -- Defensive outer block: profile creation is best-effort. If ANYTHING fails
  -- (missing table, RLS hiccup, constraint that wasn't relaxed yet), we log a
  -- warning and let the auth.users insert succeed anyway. Worst case is a
  -- missing public.users row that the app can recover from on next sign-in.
  begin
    -- Orphan cleanup: delete any pre-existing public.users row that has THIS
    -- email but a different id. This is the source of "duplicate key value
    -- violates users_email_key" errors — a previous auth user was deleted but
    -- its profile row stuck around.
    --
    -- The cascade chain on this delete (memberships, attendance, dues, etc.)
    -- removes data tied to the dead account, which is the correct semantic
    -- since that user no longer exists.
    delete from public.users
    where email = new.email
      and id != new.id;

    -- Insert the new profile row. ON CONFLICT (id) DO NOTHING in case the
    -- function is invoked twice for the same id (e.g. trigger re-fire).
    insert into public.users (id, email, full_name, role)
    values (new.id, new.email, v_full_name, v_role)
    on conflict (id) do nothing;

  exception when others then
    raise warning 'handle_new_user: profile setup failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Belt-and-braces: clean up any pre-existing orphans NOW so the first signup
-- after this migration doesn't have to fight them.
delete from public.users
where id not in (select id from auth.users);
