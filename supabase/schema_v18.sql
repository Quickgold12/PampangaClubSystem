-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Club group chat.
-- Run AFTER all previous schema_*.sql files.
--
-- Adds one table:
--   public.messages — short-form chat per club. Every member can post; messages
--   are deletable by the author OR any officer/adviser of that club.
--
-- Mirrors the announcements RLS model: read access is membership-gated, with
-- adviser/faculty coordinator visibility via the organizations row (they don't
-- have a memberships row but should still see the chat for clubs they advise).
--
-- Realtime is enabled by adding the table to the `supabase_realtime`
-- publication — that's how Supabase decides which tables stream INSERT/UPDATE/
-- DELETE events to subscribed clients.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Most queries are "give me the latest messages for org X" — composite index
-- turns the screen's initial fetch and pagination into a single index scan.
create index if not exists messages_org_created_idx
  on public.messages(organization_id, created_at desc);

alter table public.messages enable row level security;

-- ── members read messages ────────────────────────────────────────────────────
-- Any user who belongs to the club, OR is the adviser / faculty coordinator
-- named on the org row, can read the chat. Mirrors the announcements policy.
drop policy if exists "members read messages" on public.messages;
create policy "members read messages"
  on public.messages for select
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = messages.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations o
      where o.id = messages.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── members post messages ────────────────────────────────────────────────────
-- Broader than announcements: ALL members can chat, not just officers.
-- `author_id` is forced to auth.uid() in the WITH CHECK so clients can't spoof
-- the sender.
drop policy if exists "members post messages" on public.messages;
create policy "members post messages"
  on public.messages for insert
  to authenticated with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from public.memberships m
        where m.organization_id = messages.organization_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.organizations o
        where o.id = messages.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
      )
    )
  );

-- ── delete: author OR officer/adviser ────────────────────────────────────────
-- Authors can retract their own message (typo fix flow). Officers/advisers can
-- moderate inappropriate posts.
drop policy if exists "author or officer deletes message" on public.messages;
create policy "author or officer deletes message"
  on public.messages for delete
  to authenticated using (
    author_id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.organization_id = messages.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = messages.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── Realtime publication ─────────────────────────────────────────────────────
-- Supabase Realtime forwards row events from any table in the
-- `supabase_realtime` publication. `add table` is idempotent in spirit but
-- raises if the table is already there, so wrap in DO block.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then
    -- already in the publication, nothing to do
    null;
end $$;
