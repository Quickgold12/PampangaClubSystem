-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — schema additions for Financial Management.
-- Run AFTER schema.sql, schema_v2.sql, schema_v3.sql.
--
-- New table:
--   • financial_records — one row per income/expense transaction for a club.
--                         Balance = sum(income) - sum(expense), computed on
--                         demand (cheap at school scale).
--
-- RLS:
--   • members read all transactions for clubs they belong to (transparency).
--   • officers/advisers can insert + delete (no edit flow — delete + re-add).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── financial_records ────────────────────────────────────────────────────────
-- `type` is income vs expense — we always store `amount` as POSITIVE and let
-- type carry the sign. Keeps reporting simple ("sum of income", "sum of
-- expense") and avoids "negative amount" gotchas in the UI.
-- `category` is freeform text — common values: Membership Dues, Donation,
-- Event Income for income; Supplies, Venue, Refreshments for expense.
-- `record_date` is the date the transaction actually happened (defaults to
-- today). `created_at` is when the row was saved — kept separate so a late
-- entry doesn't lie about when the money moved.
create table if not exists public.financial_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  recorded_by uuid references public.users(id) on delete set null,
  record_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Most queries are "give me this club's transactions, newest first" — this
-- index makes the history view a single index scan.
create index if not exists financial_records_org_date_idx
  on public.financial_records(organization_id, record_date desc);

alter table public.financial_records enable row level security;

-- ── members read finances ────────────────────────────────────────────────────
-- Club members + the named adviser/faculty coordinator can see all the
-- transactions. School clubs generally expect financial transparency to
-- their members, so this is intentionally not officer-only.
drop policy if exists "members read finances" on public.financial_records;
create policy "members read finances"
  on public.financial_records for select
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = financial_records.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations o
      where o.id = financial_records.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );

-- ── officers insert finances ─────────────────────────────────────────────────
-- Recording a transaction is restricted to student officers, advisers, and
-- faculty coordinators of the club. recorded_by is forced to auth.uid() so
-- users can't ghost-write transactions under someone else's name.
drop policy if exists "officers insert finances" on public.financial_records;
create policy "officers insert finances"
  on public.financial_records for insert
  to authenticated with check (
    recorded_by = auth.uid()
    and (
      exists (
        select 1 from public.memberships m
        where m.organization_id = financial_records.organization_id
          and m.user_id = auth.uid()
          and m.role_in_club = 'officer'
      )
      or exists (
        select 1 from public.organizations o
        where o.id = financial_records.organization_id
          and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
      )
    )
  );

-- ── officers delete finances ─────────────────────────────────────────────────
-- Same set: useful for fixing a wrong entry by deleting and re-adding.
drop policy if exists "officers delete finances" on public.financial_records;
create policy "officers delete finances"
  on public.financial_records for delete
  to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = financial_records.organization_id
        and m.user_id = auth.uid()
        and m.role_in_club = 'officer'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = financial_records.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid())
    )
  );
