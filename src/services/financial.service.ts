// ─────────────────────────────────────────────────────────────────────────────
// Financial service — talks to the `financial_records` table.
//
// Functions:
//   • listRecords         — every transaction for a club, newest first, with
//                           the recorder's name joined.
//   • recordTransaction   — officer adds an income or expense row. Amount is
//                           always positive; `type` carries the sign.
//   • deleteRecord        — officer removes a row (delete + re-add = edit).
//   • getSummary          — totalIncome, totalExpense, balance, count for one
//                           club. Computed in one query by pulling all amounts
//                           and folding client-side (cheap at school scale).
//
// All return { data, error } so screens never need try/catch around them.
// Amount values are coerced to JS `number` — Postgres numeric(12,2) comes
// back as a string from supabase-js, which would silently break arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { FinancialRecordWithRecorder, FinancialSummary } from '@/types'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// ── List one club's transactions, newest first ──────────────────────────────
// Joins the recorder so we can show "Recorded by X" without a second query.
// Amount is coerced from numeric → number here so callers can do math.
export const listRecords = async (
  orgId: string
): Promise<Result<FinancialRecordWithRecorder[]>> => {
  const { data, error } = await supabase
    .from('financial_records')
    .select('id, organization_id, type, category, amount, description, recorded_by, record_date, created_at, receipt_url, recorder:users!financial_records_recorded_by_fkey(id, full_name)')
    .eq('organization_id', orgId)
    .order('record_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return fail(error.message)

  const rows: FinancialRecordWithRecorder[] = (data ?? []).map((r: any) => ({
    ...r,
    // numeric(12,2) → string in supabase-js → coerce to JS number.
    amount: Number(r.amount),
    recorder: oneOf(r.recorder),
  }))
  return ok(rows)
}

// ── Record a new transaction ────────────────────────────────────────────────
// `recordedBy` MUST equal auth.uid() per RLS; we pass it explicitly so the
// caller can't forget. `recordDate` defaults to today (matches DB default).
export const recordTransaction = async (params: {
  orgId: string
  type: 'income' | 'expense'
  category: string
  amount: number
  description?: string
  recordDate?: string // ISO date "YYYY-MM-DD"; defaults to today
  recordedBy: string
  receiptUrl?: string | null // optional uploaded receipt photo URL
}): Promise<Result<{ id: string }>> => {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return fail('Amount must be a positive number.')
  }

  const { data, error } = await supabase
    .from('financial_records')
    .insert({
      organization_id: params.orgId,
      type: params.type,
      category: params.category,
      amount: params.amount,
      description: params.description ?? null,
      record_date: params.recordDate ?? new Date().toISOString().slice(0, 10),
      recorded_by: params.recordedBy,
      receipt_url: params.receiptUrl ?? null,
    })
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id })
}

// ── Delete one transaction ──────────────────────────────────────────────────
// RLS limits this to officers/advisers of the row's club.
export const deleteRecord = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase.from('financial_records').delete().eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Summary for one club ────────────────────────────────────────────────────
// One round-trip: pull amounts + types for the org, fold to totals locally.
// For school-scale data (tens or low hundreds of rows per club per year)
// this is much cheaper than two server-side aggregates + an RPC, and we
// already have the records cached anyway from listRecords.
export const getSummary = async (orgId: string): Promise<Result<FinancialSummary>> => {
  const { data, error } = await supabase
    .from('financial_records')
    .select('type, amount')
    .eq('organization_id', orgId)

  if (error) return fail(error.message)

  let totalIncome = 0
  let totalExpense = 0
  for (const row of data ?? []) {
    const amt = Number(row.amount)
    if (!Number.isFinite(amt)) continue
    if (row.type === 'income') totalIncome += amt
    else if (row.type === 'expense') totalExpense += amt
  }

  return ok({
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    transactionCount: data?.length ?? 0,
  })
}

// ── Export a financial report to PDF ────────────────────────────────────────
// Builds an HTML document from the club's records + summary, renders it to a
// PDF with expo-print, then opens the share sheet (save / email / etc) with
// expo-sharing. Returns { data: true } once the share sheet has been handled.
//
// We generate HTML (not a binary PDF by hand) because expo-print's
// printToFileAsync turns HTML/CSS into a real PDF — easy to lay out and style.
export const exportFinancialPdf = async (
  clubName: string,
  records: FinancialRecordWithRecorder[],
  summary: FinancialSummary
): Promise<Result<true>> => {
  try {
    const html = buildReportHtml(clubName, records, summary)
    // Render the HTML to a temporary PDF file on the device.
    const { uri } = await Print.printToFileAsync({ html })

    // Offer the share sheet if available (it is on real devices); otherwise
    // the file still exists at `uri` and we report success.
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `${clubName} — Financial Report`,
        UTI: 'com.adobe.pdf',
      })
    }
    return ok(true)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not generate the PDF.')
  }
}

// Builds the report HTML. Kept private to this module. Inline styles only
// (printToFileAsync doesn't load external stylesheets). Money + dates are
// formatted here so the PDF reads like a real statement.
const buildReportHtml = (
  clubName: string,
  records: FinancialRecordWithRecorder[],
  summary: FinancialSummary
): string => {
  const peso = (n: number) =>
    `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const date = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  // Escape user-entered text so a stray "<" can't break the HTML.
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rows = records
    .map(
      (r) => `
        <tr>
          <td>${date(r.record_date)}</td>
          <td>${esc(r.category)}</td>
          <td>${esc(r.description ?? '')}</td>
          <td class="type ${r.type}">${r.type === 'income' ? 'Income' : 'Expense'}</td>
          <td class="amt ${r.type}">${r.type === 'income' ? '+' : '−'} ${peso(r.amount)}</td>
        </tr>`
    )
    .join('')

  const generatedOn = new Date().toLocaleString('en-PH')

  return `
    <html>
      <head><meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Roboto, sans-serif; color: #171717; padding: 24px; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          .sub { color: #737373; font-size: 12px; margin: 0 0 20px; }
          .summary { display: flex; gap: 16px; margin-bottom: 20px; }
          .box { border: 1px solid #E5E0D5; border-radius: 8px; padding: 12px 16px; flex: 1; }
          .box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #737373; }
          .box .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
          .income { color: #15803D; }
          .expense { color: #B91C1C; }
          .balance { color: #B45309; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; border-bottom: 2px solid #E5E0D5; padding: 8px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #737373; }
          td { border-bottom: 1px solid #F0EBE0; padding: 8px 6px; }
          td.amt { text-align: right; font-weight: 600; white-space: nowrap; }
          td.type { font-size: 10px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <h1>${esc(clubName)} — Financial Report</h1>
        <p class="sub">Generated ${generatedOn} • ${summary.transactionCount} transactions</p>

        <div class="summary">
          <div class="box"><div class="label">Total Income</div><div class="value income">${peso(summary.totalIncome)}</div></div>
          <div class="box"><div class="label">Total Expense</div><div class="value expense">${peso(summary.totalExpense)}</div></div>
          <div class="box"><div class="label">Balance</div><div class="value balance">${peso(summary.balance)}</div></div>
        </div>

        <table>
          <thead>
            <tr><th>Date</th><th>Category</th><th>Description</th><th>Type</th><th style="text-align:right">Amount</th></tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="color:#737373;padding:16px 6px">No transactions recorded.</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>`
}

// ── Internal: normalise single-FK joined rows (object vs 1-element array) ────
const oneOf = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
