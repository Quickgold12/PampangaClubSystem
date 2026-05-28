-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for profile photos (avatars).
-- Run AFTER all previous schema_*.sql files.
--
-- Adds:
--   • users.avatar_url — public URL of the user's profile photo (nullable).
--   • A public Storage bucket "avatars" to hold the uploaded files.
--   • Storage RLS so any signed-in user can upload, and anyone can read.
--
-- Security model mirrors club-images (schema_v9.sql):
--   • Public reads (avatars aren't sensitive; public URL = simple <Image>).
--   • Authenticated uploads. The real gate is the users table: a user can only
--     UPDATE their OWN row's avatar_url ("users update own row" policy), so an
--     orphaned upload by anyone is harmless — it never attaches to a profile.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── users.avatar_url ─────────────────────────────────────────────────────────
alter table public.users
  add column if not exists avatar_url text;

-- ── Storage bucket ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ── Storage policies (on storage.objects, scoped to the avatars bucket) ──────
drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "authenticated upload avatars" on storage.objects;
create policy "authenticated upload avatars"
  on storage.objects for insert
  to authenticated with check (bucket_id = 'avatars');

drop policy if exists "authenticated update avatars" on storage.objects;
create policy "authenticated update avatars"
  on storage.objects for update
  to authenticated using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');
