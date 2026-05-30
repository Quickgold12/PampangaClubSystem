-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Chat read-tracking.
-- Run AFTER schema_v18.sql.
--
-- Adds last_read_messages_at to memberships so the Clubs list can show a
-- Facebook-style "+N" unread badge per club, and the chat screen can clear it
-- on open. Mirrors the existing last_read_announcements_at pattern from
-- schema_v3.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.memberships
  add column if not exists last_read_messages_at timestamptz not null default now();
