// ─────────────────────────────────────────────────────────────────────────────
// Budget service — budget planning per semester/period.
//
// Model:
//   • A budget_item is a PLANNED income or expense line for a named period
//     ("1st Semester 2026"), with a category and planned amount.
//   • The actual money lives in financial_records; this is just the plan.
//
// Functions:
//   • listItems     — all budget line items for a club (any period).
//   • createItem    — officer adds a planned line item.
//   • deleteItem    — officer removes a line item.
//   • summarise     — group items into periods with planned income/expense/net.
//
// summarise() does the period grouping client-side so the screen can render a
// per-semester breakdown without extra queries.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { BudgetItem } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// One period's roll-up, produced by summarise().
export type BudgetPeriodSummary = {
  period_label: string
  items: BudgetItem[]
  plannedIncome: number
  plannedExpense: number
  net: number // plannedIncome - plannedExpense
}

// ── List all budget items for a club ────────────────────────────────────────
export const listItems = async (orgId: string): Promise<Result<BudgetItem[]>> => {
  const { data, error } = await supabase
    .from('budget_items')
    .select('id, organization_id, period_label, type, category, planned_amount, created_by, created_at')
    .eq('organization_id', orgId)
    .order('period_label', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return fail(error.message)
  const rows = (data ?? []).map((r: any) => ({ ...r, planned_amount: Number(r.planned_amount) }))
  return ok(rows as BudgetItem[])
}

// ── Create a budget line item ───────────────────────────────────────────────
export const createItem = async (params: {
  orgId: string
  periodLabel: string
  type: 'income' | 'expense'
  category: string
  plannedAmount: number
  createdBy: string
}): Promise<Result<{ id: string }>> => {
  if (!Number.isFinite(params.plannedAmount) || params.plannedAmount < 0) {
    return fail('Planned amount must be zero or a positive number.')
  }
  const { data, error } = await supabase
    .from('budget_items')
    .insert({
      organization_id: params.orgId,
      period_label: params.periodLabel,
      type: params.type,
      category: params.category,
      planned_amount: params.plannedAmount,
      created_by: params.createdBy,
    })
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id })
}

// ── Delete a budget line item ───────────────────────────────────────────────
export const deleteItem = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase.from('budget_items').delete().eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Group items into per-period summaries ───────────────────────────────────
// Pure transform over the item list — no DB call. Periods are returned in the
// order the items arrive (listItems already sorts newest period first).
export const summarise = (items: BudgetItem[]): BudgetPeriodSummary[] => {
  const byPeriod = new Map<string, BudgetPeriodSummary>()

  for (const item of items) {
    let summary = byPeriod.get(item.period_label)
    if (!summary) {
      summary = {
        period_label: item.period_label,
        items: [],
        plannedIncome: 0,
        plannedExpense: 0,
        net: 0,
      }
      byPeriod.set(item.period_label, summary)
    }
    summary.items.push(item)
    if (item.type === 'income') summary.plannedIncome += item.planned_amount
    else summary.plannedExpense += item.planned_amount
    summary.net = summary.plannedIncome - summary.plannedExpense
  }

  return Array.from(byPeriod.values())
}
