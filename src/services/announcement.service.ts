// ─────────────────────────────────────────────────────────────────────────────
// Announcement service — talks to the `announcements` table and the
// `last_read_announcements_at` column on `memberships`.
//
// Functions:
//   • listForClub          — every post for one club, newest first, with author.
//   • listFeedForUser      — every post across every club the user belongs to.
//                            Used by the home dashboard "What's New" section.
//   • postAnnouncement     — officer creates a new post.
//   • deleteAnnouncement   — officer removes a post (no edit flow yet).
//   • markClubRead         — bump the caller's last_read timestamp on a club.
//                            Call when the user opens the announcements screen.
//   • countUnreadForUser   — total announcements across all the user's clubs
//                            that are newer than their last_read on that club.
//                            Used for the "New Announcements" tile on home.
//
// All return { data, error } so screens never need try/catch around them.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { AnnouncementFeedItem, AnnouncementWithAuthor } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// ── List one club's announcements (newest first) ────────────────────────────
// Author is joined so the UI can show "Posted by Jane Doe" without a second
// query. Visibility is enforced by RLS:
//   • Approved posts: returned to any club member or adviser.
//   • Pending/rejected posts: returned to the AUTHOR.
//   • Pending posts: also returned to the adviser/faculty (moderation queue).
// So the same select serves "member feed", "author seeing own pending", and
// "adviser moderation queue" without per-role branching here.
export const listForClub = async (
  orgId: string
): Promise<Result<AnnouncementWithAuthor[]>> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, organization_id, posted_by, title, content, posted_at, status, author:users!announcements_posted_by_fkey(id, full_name)')
    .eq('organization_id', orgId)
    .order('posted_at', { ascending: false })

  if (error) return fail(error.message)

  const rows: AnnouncementWithAuthor[] = (data ?? []).map((r: any) => ({
    ...r,
    author: oneOf(r.author),
  }))
  return ok(rows)
}

// ── List the user's full feed (across all clubs) ────────────────────────────
// Pulls membership org-ids first, then fetches recent announcements for those
// orgs in a single query. Limited to the last 25 so the home feed stays light.
export const listFeedForUser = async (
  userId: string,
  limit = 25
): Promise<Result<AnnouncementFeedItem[]>> => {
  const memberships = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)

  if (memberships.error) return fail(memberships.error.message)

  const orgIds = (memberships.data ?? []).map((r: any) => r.organization_id)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('announcements')
    .select('id, organization_id, posted_by, title, content, posted_at, status, author:users!announcements_posted_by_fkey(id, full_name), organization:organizations(id, name)')
    .in('organization_id', orgIds)
    // The dashboard feed only shows APPROVED posts. Pending/rejected belong
    // on the club's own announcements screen, not in the global home feed.
    .eq('status', 'approved')
    .order('posted_at', { ascending: false })
    .limit(limit)

  if (error) return fail(error.message)

  const rows: AnnouncementFeedItem[] = (data ?? []).map((r: any) => ({
    ...r,
    author: oneOf(r.author),
    organization: oneOf(r.organization),
  }))
  return ok(rows)
}

// ── Create a new post ───────────────────────────────────────────────────────
// `posted_by` MUST match auth.uid() per RLS — we pass it explicitly so the
// caller can't forget. `asPending` toggles the moderation path:
//   • false (default) → status='approved'. Requires officer/adviser RLS path.
//   • true            → status='pending'. Any member can use; needs adviser
//                       approval before becoming visible to others.
// The caller (the announcements screen) decides which path based on the
// signed-in user's role for this specific club.
// Returns the new row id + the actual status it landed in.
export const postAnnouncement = async (
  orgId: string,
  authorId: string,
  title: string,
  content: string,
  asPending: boolean = false
): Promise<Result<{ id: string; status: 'pending' | 'approved' }>> => {
  const status = asPending ? 'pending' : 'approved'
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      organization_id: orgId,
      posted_by: authorId,
      title,
      content,
      status,
    })
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id, status })
}

// ── Author edit ─────────────────────────────────────────────────────────────
// Update title/content of an existing post. RLS allows the author to update
// their own row (schema_v15.sql); the BEFORE-UPDATE trigger blocks status
// spoofing, so we only need to send the editable fields. Adviser/faculty also
// pass via their existing moderation policy.
export const updateAnnouncement = async (
  id: string,
  updates: { title?: string; content?: string }
): Promise<Result<true>> => {
  const { error } = await supabase.from('announcements').update(updates).eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Adviser/faculty moderation: approve a pending post ──────────────────────
// RLS limits this to the club's adviser/faculty coordinator. Officers (even
// student officers) cannot approve — they can only post their own as
// pre-approved.
export const approveAnnouncement = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase
    .from('announcements')
    .update({ status: 'approved' })
    .eq('id', id)
    .eq('status', 'pending') // guard against double-action races
  if (error) return fail(error.message)
  return ok(true)
}

// ── Adviser/faculty moderation: reject a pending post ───────────────────────
// We keep the row (so the author can see it was rejected) instead of deleting.
// If the adviser wants it gone entirely they can use the delete flow too.
export const rejectAnnouncement = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase
    .from('announcements')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) return fail(error.message)
  return ok(true)
}

// ── Delete one post ─────────────────────────────────────────────────────────
// RLS limits this to officers/advisers of the post's club.
export const deleteAnnouncement = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Mark all announcements for a club as read for the calling user ──────────
// "Read" really means "I've seen up to this moment" — we just set the
// timestamp to now(). The unread counter then compares posted_at > this
// timestamp. The RLS "members update own membership" policy makes this safe.
export const markClubRead = async (
  orgId: string,
  userId: string
): Promise<Result<true>> => {
  const { error } = await supabase
    .from('memberships')
    .update({ last_read_announcements_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('user_id', userId)

  if (error) return fail(error.message)
  return ok(true)
}

// ── Total unread announcements across all the user's clubs ──────────────────
// No fancy SQL — we fetch (org_id, last_read_at) for each membership, then
// pull a HEAD count of announcements newer than that per club, summed.
// Number of queries = number of clubs the user is in. For school-scale (≤ a
// handful of clubs per person) this is fine.
export const countUnreadForUser = async (userId: string): Promise<Result<number>> => {
  const memberships = await supabase
    .from('memberships')
    .select('organization_id, last_read_announcements_at')
    .eq('user_id', userId)

  if (memberships.error) return fail(memberships.error.message)
  const rows = memberships.data ?? []
  if (rows.length === 0) return ok(0)

  // Fire all the per-club counts in parallel. Only APPROVED posts count
  // toward the unread badge — we don't want pending/rejected posts to
  // ping members who can't see them.
  const counts = await Promise.all(
    rows.map((r: any) =>
      supabase
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', r.organization_id)
        .eq('status', 'approved')
        .gt('posted_at', r.last_read_announcements_at)
    )
  )

  const total = counts.reduce((sum, res) => sum + (res.error ? 0 : res.count ?? 0), 0)
  return ok(total)
}

// ── Moderation dashboard: count pending across all clubs the user advises ──
// Only adviser/faculty have moderation power for announcements (per
// schema_v5.sql). We look up the orgs they advise first, then count pending
// announcements in those orgs. Returns 0 if the user advises nothing.
export const countPendingForReviewer = async (
  reviewerId: string
): Promise<Result<number>> => {
  const orgIds = await getAdvisedOrgIds(reviewerId)
  if (orgIds.length === 0) return ok(0)

  const { count, error } = await supabase
    .from('announcements')
    .select('id', { count: 'exact', head: true })
    .in('organization_id', orgIds)
    .eq('status', 'pending')

  if (error) return fail(error.message)
  return ok(count ?? 0)
}

// ── Moderation queue: full pending list with author + org name joined ──────
// Used by the global moderation screen. Each row knows which club it belongs
// to so the screen can group / link back to the per-club moderation page.
export const listPendingForReviewer = async (
  reviewerId: string
): Promise<Result<AnnouncementFeedItem[]>> => {
  const orgIds = await getAdvisedOrgIds(reviewerId)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('announcements')
    .select('id, organization_id, posted_by, title, content, posted_at, status, author:users!announcements_posted_by_fkey(id, full_name), organization:organizations(id, name)')
    .in('organization_id', orgIds)
    .eq('status', 'pending')
    .order('posted_at', { ascending: true }) // oldest first — "first in, first reviewed"

  if (error) return fail(error.message)

  const rows: AnnouncementFeedItem[] = (data ?? []).map((r: any) => ({
    ...r,
    author: oneOf(r.author),
    organization: oneOf(r.organization),
  }))
  return ok(rows)
}

// ── Internal: orgs where the caller is adviser or faculty coordinator ──────
// Centralised here so the count and list functions stay in lock-step.
const getAdvisedOrgIds = async (reviewerId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .or(`adviser_id.eq.${reviewerId},faculty_coordinator_id.eq.${reviewerId}`)

  if (error || !data) return []
  return data.map((r: any) => r.id)
}

// ── Internal helper ─────────────────────────────────────────────────────────
// Supabase returns single-FK joined rows as either an object or a one-element
// array, depending on relationship inference. This normalises both shapes.
const oneOf = <T>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
