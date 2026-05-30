-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Editable chat messages.
-- Run AFTER schema_v24.sql.
--
-- Adds:
--   • messages.edited_at — set when the author edits a message, so the UI can
--     show an "(edited)" marker. NULL means never edited.
--   • An UPDATE RLS policy letting an author edit ONLY their own message body.
--     (Until now messages had no UPDATE policy at all, so edits were blocked.)
--
-- The WITH CHECK keeps author_id = auth.uid() so an edit can't reassign
-- authorship. We don't try to lock down WHICH columns change at the SQL layer
-- (Postgres RLS can't do per-column easily); the client only ever sends
-- { body, edited_at }.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.messages
  add column if not exists edited_at timestamptz;

drop policy if exists "author edits own message" on public.messages;
create policy "author edits own message"
  on public.messages for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
