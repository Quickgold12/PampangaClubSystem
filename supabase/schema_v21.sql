-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Server-clock chat read marker.
-- Run AFTER schema_v20.sql.
--
-- Why this exists (the "I get notified for my own message" bug):
--   markChatRead was writing last_read_at using the CLIENT's clock
--   (new Date().toISOString()), but messages.created_at is stamped by the
--   DATABASE server's clock (default now()). On a device whose clock is even
--   slightly behind the server, the user's just-sent message has a
--   created_at LATER than their own last_read_at, so it counts as unread to
--   themselves. Phone clocks drift constantly, so this reproduces reliably.
--
-- Fix:
--   A SECURITY INVOKER RPC that upserts chat_reads.last_read_at = now(),
--   where now() is the SERVER's transaction clock — the same clock that
--   stamps messages.created_at. Because the read is written AFTER the message
--   row is inserted, last_read_at >= created_at for everything the user has
--   sent or seen, so it can never flag their own message as unread.
--
--   SECURITY INVOKER keeps RLS in force: the existing chat_reads
--   insert/update policies already restrict writes to the caller's own row
--   (user_id = auth.uid()), and we hardcode user_id := auth.uid() here.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.mark_chat_read(p_org_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.chat_reads (user_id, organization_id, last_read_at)
  values (auth.uid(), p_org_id, now())
  on conflict (user_id, organization_id)
  do update set last_read_at = now();
$$;

-- Let signed-in users call it.
grant execute on function public.mark_chat_read(uuid) to authenticated;
