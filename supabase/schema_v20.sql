-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Per-user chat read-tracking that works for ANY role.
-- Run AFTER schema_v19.sql.
--
-- Why this exists:
--   The old approach stored last_read_messages_at on `memberships`. Advisers
--   and faculty coordinators don't have a memberships row (they're named
--   directly on the org), so they never received an unread badge — their own
--   chat unread count was effectively dead. This is the bug "the other end
--   (adviser) doesn't get notified when a student sends a message".
--
-- Fix:
--   A dedicated chat_reads table keyed (user_id, organization_id). Any
--   authenticated user can have a row in it regardless of whether they're a
--   member, adviser, or faculty coordinator.
--
-- Backfill:
--   • Members: copy their existing memberships.last_read_messages_at over so
--     they don't suddenly see every historical message as unread.
--   • Advisers / faculty coordinators: seed last_read_at = now() so the
--     migration doesn't dump a huge unread count on them.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.chat_reads (
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

alter table public.chat_reads enable row level security;

-- Read own rows only.
drop policy if exists "user reads own chat_reads" on public.chat_reads;
create policy "user reads own chat_reads"
  on public.chat_reads for select
  to authenticated using (user_id = auth.uid());

-- Insert / update / delete own rows. We expose all three so the client can
-- use a simple upsert without permission gymnastics.
drop policy if exists "user inserts own chat_reads" on public.chat_reads;
create policy "user inserts own chat_reads"
  on public.chat_reads for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "user updates own chat_reads" on public.chat_reads;
create policy "user updates own chat_reads"
  on public.chat_reads for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user deletes own chat_reads" on public.chat_reads;
create policy "user deletes own chat_reads"
  on public.chat_reads for delete
  to authenticated using (user_id = auth.uid());

-- ── Backfill: members → copy their existing last_read_messages_at ────────────
insert into public.chat_reads (user_id, organization_id, last_read_at)
select user_id, organization_id, last_read_messages_at
from public.memberships
on conflict (user_id, organization_id) do nothing;

-- ── Backfill: advisers + faculty coordinators → seed at now() ────────────────
insert into public.chat_reads (user_id, organization_id, last_read_at)
select adviser_id, id, now()
from public.organizations
where adviser_id is not null
on conflict (user_id, organization_id) do nothing;

insert into public.chat_reads (user_id, organization_id, last_read_at)
select faculty_coordinator_id, id, now()
from public.organizations
where faculty_coordinator_id is not null
on conflict (user_id, organization_id) do nothing;
