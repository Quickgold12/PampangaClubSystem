// ─────────────────────────────────────────────────────────────────────────────
// Dues service — collection tracking (who paid their dues).
//
// Model:
//   • A "dues period" (dues_periods) is one collection campaign with an
//     expected per-member amount, e.g. "1st Semester 2026 Dues — ₱150".
//   • A dues_payments row exists ONLY for members who have paid. Presence =
//     paid; to mark unpaid we delete the row. The unique(period,user)
//     constraint prevents double-marking.
//
// Functions:
//   • listPeriods       — all dues periods for a club, newest first.
//   • createPeriod      — officer adds a new collection campaign.
//   • deletePeriod      — officer removes a campaign (cascades its payments).
//   • getMemberStatuses — for one period: every club member + whether they paid.
//   • setPaid           — mark a member paid (insert) or unpaid (delete).
//
// All return { data, error }; RLS enforces who can read/write.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { DuesMemberStatus, DuesPeriod } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// ── List dues periods for a club ────────────────────────────────────────────
export const listPeriods = async (orgId: string): Promise<Result<DuesPeriod[]>> => {
  const { data, error } = await supabase
    .from('dues_periods')
    .select('id, organization_id, name, amount, created_by, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return fail(error.message)
  // numeric → number coercion (supabase-js returns numeric as string).
  const rows = (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) }))
  return ok(rows as DuesPeriod[])
}

// ── Create a dues period ────────────────────────────────────────────────────
export const createPeriod = async (params: {
  orgId: string
  name: string
  amount: number
  createdBy: string
}): Promise<Result<{ id: string }>> => {
  const { data, error } = await supabase
    .from('dues_periods')
    .insert({
      organization_id: params.orgId,
      name: params.name,
      amount: params.amount,
      created_by: params.createdBy,
    })
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id })
}

// ── Delete a dues period (and its payments via FK cascade) ──────────────────
export const deletePeriod = async (periodId: string): Promise<Result<true>> => {
  const { error } = await supabase.from('dues_periods').delete().eq('id', periodId)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Per-member paid/unpaid status for one period ────────────────────────────
// Joins the club roster (memberships) with the set of paid user ids for the
// period, so the screen can render a checklist with everyone — paid or not.
export const getMemberStatuses = async (
  orgId: string,
  periodId: string
): Promise<Result<DuesMemberStatus[]>> => {
  const [membersRes, paymentsRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('user_id, users:users!memberships_user_id_fkey(id, full_name)')
      .eq('organization_id', orgId),
    supabase
      .from('dues_payments')
      .select('user_id, paid_at')
      .eq('dues_period_id', periodId),
  ])

  if (membersRes.error) return fail(membersRes.error.message)
  if (paymentsRes.error) return fail(paymentsRes.error.message)

  // Map user_id → paid_at for quick lookup.
  const paidMap = new Map<string, string>()
  for (const p of paymentsRes.data ?? []) paidMap.set(p.user_id, p.paid_at)

  const oneOf = <T>(v: T | T[] | null | undefined): T | null =>
    !v ? null : Array.isArray(v) ? v[0] ?? null : v

  const statuses: DuesMemberStatus[] = (membersRes.data ?? [])
    .map((m: any) => {
      const u = oneOf<any>(m.users)
      if (!u) return null
      return {
        user_id: u.id,
        full_name: u.full_name,
        paid: paidMap.has(u.id),
        paid_at: paidMap.get(u.id) ?? null,
      }
    })
    .filter((x: DuesMemberStatus | null): x is DuesMemberStatus => x !== null)
    // Unpaid first so officers see who still owes at the top.
    .sort((a, b) => Number(a.paid) - Number(b.paid))

  return ok(statuses)
}

// ── Mark a member paid (insert) or unpaid (delete) ──────────────────────────
// `paid=true` upserts a payment row; `paid=false` removes it. Idempotent.
export const setPaid = async (params: {
  orgId: string
  periodId: string
  userId: string
  paid: boolean
  recordedBy: string
}): Promise<Result<true>> => {
  if (params.paid) {
    const { error } = await supabase.from('dues_payments').upsert(
      {
        organization_id: params.orgId,
        dues_period_id: params.periodId,
        user_id: params.userId,
        recorded_by: params.recordedBy,
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'dues_period_id,user_id', ignoreDuplicates: true }
    )
    if (error) return fail(error.message)
  } else {
    const { error } = await supabase
      .from('dues_payments')
      .delete()
      .eq('dues_period_id', params.periodId)
      .eq('user_id', params.userId)
    if (error) return fail(error.message)
  }
  return ok(true)
}
