-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Chat anti-flood rate limit.
-- Run AFTER schema_v25.sql.
--
-- Stops a single user from flooding a club chat (spam, accidental send loops,
-- or a misbehaving client). A BEFORE INSERT trigger counts that author's very
-- recent messages and rejects the insert if they're over the threshold.
--
-- Threshold: 10 messages per 10 seconds per user (across all clubs). Generous
-- for real conversation, harsh for a flood. The raised message is prefixed
-- with "rate_limit:" so the client can show a friendly notice instead of a raw
-- Postgres error (see chat.service.ts → sendMessage).
--
-- This runs as part of the same transaction as the insert, with the row's
-- author_id available as NEW.author_id (already forced to auth.uid() by the
-- insert RLS policy), so it can't be spoofed to dodge the limit.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  -- Count this author's messages in the trailing window.
  select count(*) into recent_count
  from public.messages
  where author_id = new.author_id
    and created_at > now() - interval '10 seconds';

  if recent_count >= 10 then
    raise exception 'rate_limit: You''re sending messages too quickly. Wait a moment and try again.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();
