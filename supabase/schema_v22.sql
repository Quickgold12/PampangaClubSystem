-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Live Chat tab badge.
-- Run AFTER schema_v21.sql.
--
-- Adds chat_reads to the supabase_realtime publication so the bottom-tab Chat
-- badge can react to read-state changes in real time:
--   • A new message arrives (messages INSERT, already published) → badge +1.
--   • The user opens a chat → markChatRead upserts chat_reads → the client
--     gets a realtime event on its own chat_reads row → badge recomputes and
--     drops. Without this, the tab badge would only refresh on a full reload.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.chat_reads;
exception
  when duplicate_object then null;  -- already published, nothing to do
end $$;
