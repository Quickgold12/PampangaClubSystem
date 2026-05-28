// ─────────────────────────────────────────────────────────────────────────────
// Report service — formal officer submissions awaiting adviser approval.
//
// Functions:
//   • listForClub      — every report for one club, newest first, with
//                        submitter + (optional) reviewer joined.
//   • submitReport     — officer/adviser creates a new pending report.
//   • approveReport    — adviser/faculty marks pending → approved.
//   • rejectReport     — adviser/faculty marks pending → rejected, with an
//                        optional reason in review_comment.
//   • deleteReport     — original submitter or adviser removes the row.
//
// All return { data, error }. RLS in schema_v6.sql is what actually enforces
// who can do what — these functions just present the API cleanly.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { ReportFeedItem, ReportType, ReportWithPeople } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// ── List one club's reports, newest first ───────────────────────────────────
// Both joined profiles (submitter + reviewer) are fetched in the same query
// so the UI doesn't need a second round-trip. reviewer can be null when the
// report is still pending.
export const listForClub = async (
  orgId: string
): Promise<Result<ReportWithPeople[]>> => {
  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, organization_id, submitted_by, type, title, content, status, submitted_at, reviewed_at, reviewed_by, review_comment, submitter:users!reports_submitted_by_fkey(id, full_name), reviewer:users!reports_reviewed_by_fkey(id, full_name)'
    )
    .eq('organization_id', orgId)
    .order('submitted_at', { ascending: false })

  if (error) return fail(error.message)

  const rows: ReportWithPeople[] = (data ?? []).map((r: any) => ({
    ...r,
    submitter: oneOf(r.submitter),
    reviewer: oneOf(r.reviewer),
  }))
  return ok(rows)
}

// ── Submit a new report ─────────────────────────────────────────────────────
// `submittedBy` MUST equal auth.uid() per RLS; passed explicitly so the
// caller can't forget. Status starts at 'pending' (DB default).
export const submitReport = async (params: {
  orgId: string
  type: ReportType
  title: string
  content: string
  submittedBy: string
}): Promise<Result<{ id: string }>> => {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      organization_id: params.orgId,
      submitted_by: params.submittedBy,
      type: params.type,
      title: params.title,
      content: params.content,
    })
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id })
}

// ── Author edit ─────────────────────────────────────────────────────────────
// Update an existing report's editable fields. RLS allows the submitter to
// update their own row (schema_v15.sql); a BEFORE-UPDATE trigger blocks any
// non-adviser from touching status / reviewed_by / reviewed_at / review_comment.
export const updateReport = async (
  id: string,
  updates: { type?: 'activity' | 'financial'; title?: string; content?: string }
): Promise<Result<true>> => {
  const { error } = await supabase.from('reports').update(updates).eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Approve a pending report ────────────────────────────────────────────────
// RLS limits this to adviser/faculty of the club. The .eq('status','pending')
// guards against a race where two reviewers click at once.
export const approveReport = async (
  reportId: string,
  reviewerId: string,
  comment?: string
): Promise<Result<true>> => {
  const { error } = await supabase
    .from('reports')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_comment: comment ?? null,
    })
    .eq('id', reportId)
    .eq('status', 'pending')

  if (error) return fail(error.message)
  return ok(true)
}

// ── Reject a pending report ─────────────────────────────────────────────────
// We keep the row (rejection is part of the audit trail) and store the
// adviser's comment so the submitter understands why.
export const rejectReport = async (
  reportId: string,
  reviewerId: string,
  comment?: string
): Promise<Result<true>> => {
  const { error } = await supabase
    .from('reports')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_comment: comment ?? null,
    })
    .eq('id', reportId)
    .eq('status', 'pending')

  if (error) return fail(error.message)
  return ok(true)
}

// ── Delete a report ─────────────────────────────────────────────────────────
// RLS limits this to the original submitter OR adviser/faculty. Officer-vs-
// officer delete is blocked at the DB layer.
export const deleteReport = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase.from('reports').delete().eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Moderation dashboard: count pending reports across advised clubs ──────
// Reports can only be moderated by adviser/faculty (per schema_v6.sql), so
// this looks up the orgs they advise and counts pending reports in those.
export const countPendingForReviewer = async (
  reviewerId: string
): Promise<Result<number>> => {
  const orgIds = await getAdvisedOrgIds(reviewerId)
  if (orgIds.length === 0) return ok(0)

  const { count, error } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .in('organization_id', orgIds)
    .eq('status', 'pending')

  if (error) return fail(error.message)
  return ok(count ?? 0)
}

// ── Moderation queue: full pending list with submitter + org name joined ──
// Powers the global "Pending Reports" screen. Oldest first so the longest-
// waiting submissions surface first.
export const listPendingForReviewer = async (
  reviewerId: string
): Promise<Result<ReportFeedItem[]>> => {
  const orgIds = await getAdvisedOrgIds(reviewerId)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, organization_id, submitted_by, type, title, content, status, submitted_at, reviewed_at, reviewed_by, review_comment, submitter:users!reports_submitted_by_fkey(id, full_name), reviewer:users!reports_reviewed_by_fkey(id, full_name), organization:organizations(id, name)'
    )
    .in('organization_id', orgIds)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) return fail(error.message)

  const rows: ReportFeedItem[] = (data ?? []).map((r: any) => ({
    ...r,
    submitter: oneOf(r.submitter),
    reviewer: oneOf(r.reviewer),
    organization: oneOf(r.organization),
  }))
  return ok(rows)
}

// ── Internal: orgs where the caller is adviser or faculty coordinator ──────
const getAdvisedOrgIds = async (reviewerId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .or(`adviser_id.eq.${reviewerId},faculty_coordinator_id.eq.${reviewerId}`)

  if (error || !data) return []
  return data.map((r: any) => r.id)
}

// ── Internal: normalise single-FK joined rows (object vs 1-element array) ───
const oneOf = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
