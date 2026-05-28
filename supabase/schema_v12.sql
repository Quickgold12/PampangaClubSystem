-- ─────────────────────────────────────────────────────────────────────────────
-- Pampanga Club System — Financial add-ons.
-- Run AFTER all previous schema_*.sql files.
--
-- Adds three things:
--   1. Receipt photos      → financial_records.receipt_url + 'receipts' bucket.
--   2. Collection tracking → dues_periods + dues_payments (who paid dues).
--   3. Budget planning      → budget_items (planned income/expense per period).
--
-- RLS pattern is the same as the rest of the app:
--   • Members of a club (+ its adviser/faculty) can READ.
--   • Officers/advisers/faculty can WRITE (insert/delete; update where needed).
-- Officer-vs-officer deletes follow the creator-or-adviser rule from v5.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) RECEIPT PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════

-- Optional receipt image URL on each transaction.
alter table public.financial_records
  add column if not exists receipt_url text;

-- Public bucket for receipt images (same model as club-images/avatars).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts are public" on storage.objects;
create policy "receipts are public"
  on storage.objects for select
  using (bucket_id = 'receipts');

drop policy if exists "authenticated upload receipts" on storage.objects;
create policy "authenticated upload receipts"
  on storage.objects for insert
  to authenticated with check (bucket_id = 'receipts');

drop policy if exists "authenticated update receipts" on storage.objects;
create policy "authenticated update receipts"
  on storage.objects for update
  to authenticated using (bucket_id = 'receipts')
  with check (bucket_id = 'receipts');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) COLLECTION TRACKING (DUES)
-- ═══════════════════════════════════════════════════════════════════════════

-- A "dues period" is one collection campaign, e.g. "1st Semester 2026 Dues",
-- with the expected amount per member.
create table if not exists public.dues_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists dues_periods_org_idx
  on public.dues_periods(organization_id, created_at desc);

-- One row per member who HAS PAID a given period. Presence = paid; to mark
-- unpaid we delete the row. organization_id is denormalized so RLS can be the
-- same simple shape as the rest of the app (no join through dues_periods).
create table if not exists public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dues_period_id uuid not null references public.dues_periods(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.users(id) on delete set null,
  unique (dues_period_id, user_id)
);

create index if not exists dues_payments_period_idx
  on public.dues_payments(dues_period_id);

alter table public.dues_periods enable row level security;
alter table public.dues_payments enable row level security;

-- Helper note: both tables reuse the "member reads / officer writes" shape.

-- dues_periods: members read, officers/advisers write.
drop policy if exists "members read dues_periods" on public.dues_periods;
create policy "members read dues_periods"
  on public.dues_periods for select
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = dues_periods.organization_id and m.user_id = auth.uid())
    or exists (select 1 from public.organizations o
      where o.id = dues_periods.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

drop policy if exists "officers write dues_periods" on public.dues_periods;
create policy "officers write dues_periods"
  on public.dues_periods for insert
  to authenticated with check (
    exists (select 1 from public.memberships m
      where m.organization_id = dues_periods.organization_id and m.user_id = auth.uid()
        and m.role_in_club = 'officer')
    or exists (select 1 from public.organizations o
      where o.id = dues_periods.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

drop policy if exists "officers delete dues_periods" on public.dues_periods;
create policy "officers delete dues_periods"
  on public.dues_periods for delete
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = dues_periods.organization_id and m.user_id = auth.uid()
        and m.role_in_club = 'officer')
    or exists (select 1 from public.organizations o
      where o.id = dues_periods.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

-- dues_payments: members read, officers/advisers insert + delete (the toggle).
drop policy if exists "members read dues_payments" on public.dues_payments;
create policy "members read dues_payments"
  on public.dues_payments for select
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = dues_payments.organization_id and m.user_id = auth.uid())
    or exists (select 1 from public.organizations o
      where o.id = dues_payments.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

drop policy if exists "officers insert dues_payments" on public.dues_payments;
create policy "officers insert dues_payments"
  on public.dues_payments for insert
  to authenticated with check (
    exists (select 1 from public.memberships m
      where m.organization_id = dues_payments.organization_id and m.user_id = auth.uid()
        and m.role_in_club = 'officer')
    or exists (select 1 from public.organizations o
      where o.id = dues_payments.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

drop policy if exists "officers delete dues_payments" on public.dues_payments;
create policy "officers delete dues_payments"
  on public.dues_payments for delete
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = dues_payments.organization_id and m.user_id = auth.uid()
        and m.role_in_club = 'officer')
    or exists (select 1 from public.organizations o
      where o.id = dues_payments.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) BUDGET PLANNING
-- ═══════════════════════════════════════════════════════════════════════════

-- A budget line item: a PLANNED income or expense for a named period
-- ("1st Semester 2026"). Actual spending lives in financial_records; this is
-- the plan to compare against.
create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_label text not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  planned_amount numeric(12, 2) not null check (planned_amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists budget_items_org_idx
  on public.budget_items(organization_id, period_label);

alter table public.budget_items enable row level security;

drop policy if exists "members read budget_items" on public.budget_items;
create policy "members read budget_items"
  on public.budget_items for select
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = budget_items.organization_id and m.user_id = auth.uid())
    or exists (select 1 from public.organizations o
      where o.id = budget_items.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

drop policy if exists "officers insert budget_items" on public.budget_items;
create policy "officers insert budget_items"
  on public.budget_items for insert
  to authenticated with check (
    exists (select 1 from public.memberships m
      where m.organization_id = budget_items.organization_id and m.user_id = auth.uid()
        and m.role_in_club = 'officer')
    or exists (select 1 from public.organizations o
      where o.id = budget_items.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );

drop policy if exists "officers delete budget_items" on public.budget_items;
create policy "officers delete budget_items"
  on public.budget_items for delete
  to authenticated using (
    exists (select 1 from public.memberships m
      where m.organization_id = budget_items.organization_id and m.user_id = auth.uid()
        and m.role_in_club = 'officer')
    or exists (select 1 from public.organizations o
      where o.id = budget_items.organization_id
        and (o.adviser_id = auth.uid() or o.faculty_coordinator_id = auth.uid()))
  );
