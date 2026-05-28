-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for club cover images (file uploads).
-- Run AFTER all previous schema_*.sql files.
--
-- Adds:
--   • organizations.image_url — public URL of the club's cover image (nullable).
--   • A public Storage bucket "club-images" to hold the uploaded files.
--   • Storage RLS so any signed-in user can upload, and anyone can read.
--
-- Security model:
--   • The bucket is PUBLIC for reads (cover images aren't sensitive, and a
--     public URL lets the app render them with simple <Image> caching).
--   • Uploads require an authenticated user. We DON'T restrict uploads to
--     advisers at the storage layer because the real gate is on the
--     organizations table: only a club's adviser/faculty can UPDATE its
--     image_url (schema_v8.sql). An orphaned upload by a non-adviser is
--     harmless — it just never gets attached to a club.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── organizations.image_url ──────────────────────────────────────────────────
alter table public.organizations
  add column if not exists image_url text;

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- `public = true` makes objects readable via their public URL without a signed
-- request. on conflict do nothing so re-running is safe.
insert into storage.buckets (id, name, public)
values ('club-images', 'club-images', true)
on conflict (id) do nothing;

-- ── Storage policies (on storage.objects, scoped to our bucket) ──────────────
-- Public read: anyone (even anon) can read objects in this bucket. This backs
-- the public URL used by the app.
drop policy if exists "club images are public" on storage.objects;
create policy "club images are public"
  on storage.objects for select
  using (bucket_id = 'club-images');

-- Authenticated upload: any signed-in user may add objects to this bucket.
drop policy if exists "authenticated upload club images" on storage.objects;
create policy "authenticated upload club images"
  on storage.objects for insert
  to authenticated with check (bucket_id = 'club-images');

-- Authenticated overwrite: allow replacing an existing object (we upsert the
-- cover at a stable path per club, so updating a cover overwrites in place).
drop policy if exists "authenticated update club images" on storage.objects;
create policy "authenticated update club images"
  on storage.objects for update
  to authenticated using (bucket_id = 'club-images')
  with check (bucket_id = 'club-images');
