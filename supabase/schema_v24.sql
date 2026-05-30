-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Expo push tokens (remote push notifications).
-- Run AFTER schema_v23.sql.
--
-- Stores one row per device push token so the notify-on-message Edge Function
-- can fan out a chat notification to every recipient's device(s) even when the
-- app is fully closed (Realtime only fires while the app is running).
--
-- A user can have several tokens (phone + tablet, reinstalls, etc.), so the
-- token is the primary key and user_id is the owner. The Edge Function reads
-- this table with the service role key (bypasses RLS); the policies below only
-- govern the CLIENT, which manages its own device's token.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

-- Client manages only its own tokens.
drop policy if exists "user reads own push_tokens" on public.push_tokens;
create policy "user reads own push_tokens"
  on public.push_tokens for select
  to authenticated using (user_id = auth.uid());

drop policy if exists "user inserts own push_tokens" on public.push_tokens;
create policy "user inserts own push_tokens"
  on public.push_tokens for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "user updates own push_tokens" on public.push_tokens;
create policy "user updates own push_tokens"
  on public.push_tokens for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user deletes own push_tokens" on public.push_tokens;
create policy "user deletes own push_tokens"
  on public.push_tokens for delete
  to authenticated using (user_id = auth.uid());
