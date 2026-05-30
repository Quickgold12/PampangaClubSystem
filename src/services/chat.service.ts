// ─────────────────────────────────────────────────────────────────────────────
// Chat service — talks to the `messages` table (one group chat per club).
//
// Pattern matches clubs.service / announcements.service: every function returns
// `{ data, error }` so screens stay try/catch-free.
//
// Three responsibilities:
//   • listMessages       — initial page load (newest N, returned oldest-first
//                           so an inverted FlatList renders them correctly).
//   • sendMessage        — INSERT a new row. RLS enforces membership + forces
//                           author_id to auth.uid().
//   • subscribeToMessages — Supabase Realtime subscription on INSERT events.
//                           Returns a cleanup function. Inserts are delivered
//                           by `postgres_changes` filtered to THIS club only.
//                           Because the realtime payload doesn't include the
//                           joined author profile, the screen looks up the
//                           author name from its local member map (cheap).
//   • deleteMessage      — RLS lets author OR officer/adviser delete.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { ClubMessage, ClubMessageWithAuthor, MessageReportFeedItem } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// Default page size. Chat screens typically only need to render the most recent
// few dozen on first paint — older messages can be paged in later. Exported so
// the screen can tell "a full page came back, there may be more".
export const CHAT_PAGE_SIZE = 50

const MESSAGE_SELECT =
  'id, organization_id, author_id, body, created_at, edited_at, author:users!messages_author_id_fkey(id, full_name)'

// Supabase returns single-FK joined rows as either an object or a 1-element
// array; coerce so callers always see a single record.
const oneOf = <T>(v: T | T[] | null | undefined): T | null => {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

const mapMessageRow = (row: any): ClubMessageWithAuthor => ({
  id: row.id,
  organization_id: row.organization_id,
  author_id: row.author_id,
  body: row.body,
  created_at: row.created_at,
  edited_at: row.edited_at ?? null,
  author: oneOf<{ id: string; full_name: string }>(row.author),
})

// ── List the most recent N messages, returned oldest-first ──────────────────
// We fetch newest-first to take advantage of the `messages_org_created_idx`
// index, then reverse so the consumer (typically an inverted FlatList or a
// chronological scroll view) can render in chronological order.
export const listMessages = async (
  organizationId: string,
  limit: number = CHAT_PAGE_SIZE
): Promise<Result<ClubMessageWithAuthor[]>> => {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return fail(error.message)

  // Reverse to oldest-first so the chat UI can simply append.
  return ok((data ?? []).map(mapMessageRow).reverse())
}

// ── Page older messages (for "load earlier" at the top of the chat) ─────────
// Returns up to `limit` messages strictly OLDER than `beforeCreatedAt`, in
// oldest-first order so the screen can prepend them to its existing list.
// `beforeCreatedAt` is the created_at of the oldest message currently loaded.
export const listMessagesBefore = async (
  organizationId: string,
  beforeCreatedAt: string,
  limit: number = CHAT_PAGE_SIZE
): Promise<Result<ClubMessageWithAuthor[]>> => {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('organization_id', organizationId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return fail(error.message)

  return ok((data ?? []).map(mapMessageRow).reverse())
}

// ── Send a new message ──────────────────────────────────────────────────────
// RLS forces author_id = auth.uid() in the WITH CHECK clause; we still pass it
// explicitly so the insert succeeds without a Postgres "missing column" error.
export const sendMessage = async (
  organizationId: string,
  authorId: string,
  body: string
): Promise<Result<ClubMessage>> => {
  const trimmed = body.trim()
  if (!trimmed) return fail('Message cannot be empty.')
  if (trimmed.length > 2000) return fail('Message is too long (max 2000 characters).')

  const { data, error } = await supabase
    .from('messages')
    .insert({
      organization_id: organizationId,
      author_id: authorId,
      body: trimmed,
    })
    .select('id, organization_id, author_id, body, created_at, edited_at')
    .single()

  if (error) return fail(cleanRateLimitError(error.message))
  return ok(data as ClubMessage)
}

// The rate-limit trigger (schema_v26) raises an exception prefixed with
// "rate_limit:". Postgres surfaces it as e.g. 'rate_limit: You're sending…'.
// Strip the prefix so the user sees a clean sentence, not a raw DB error.
const cleanRateLimitError = (msg: string): string => {
  const marker = 'rate_limit:'
  const i = msg.indexOf(marker)
  if (i === -1) return msg
  return msg.slice(i + marker.length).trim()
}

// ── Edit an existing message (author only) ──────────────────────────────────
// RLS ("author edits own message", schema_v25) restricts this to the author.
// Sets edited_at = now() so the UI can show an "(edited)" marker.
export const editMessage = async (
  messageId: string,
  body: string
): Promise<Result<ClubMessage>> => {
  const trimmed = body.trim()
  if (!trimmed) return fail('Message cannot be empty.')
  if (trimmed.length > 2000) return fail('Message is too long (max 2000 characters).')

  const { data, error } = await supabase
    .from('messages')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id, organization_id, author_id, body, created_at, edited_at')
    .single()

  if (error) return fail(error.message)
  return ok(data as ClubMessage)
}

// ── Delete a message ────────────────────────────────────────────────────────
// RLS gates this to the author OR officers/advisers of the club, so the client
// doesn't need to recheck. Returns true on success.
export const deleteMessage = async (messageId: string): Promise<Result<true>> => {
  const { error } = await supabase.from('messages').delete().eq('id', messageId)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Mark the chat as read for the caller ────────────────────────────────────
// Calls the mark_chat_read RPC (schema_v21), which upserts chat_reads with
// last_read_at = now() using the SERVER's clock. This is critical: comparing
// the server-stamped messages.created_at against a CLIENT-stamped timestamp
// caused users to be notified about their OWN messages whenever their device
// clock lagged the server. Using the server clock for both sides removes the
// skew entirely.
//
// Works for ANY authenticated user (members, officers, advisers, faculty
// coordinators) — chat_reads isn't tied to a memberships row. The `userId`
// param is kept for call-site compatibility but the RPC derives the user from
// auth.uid() server-side (and RLS enforces it).
export const markChatRead = async (
  orgId: string,
  _userId: string
): Promise<Result<true>> => {
  const { error } = await supabase.rpc('mark_chat_read', { p_org_id: orgId })
  if (error) return fail(error.message)
  return ok(true)
}

// Row shape for the Chat tab's room list. One per club the caller has access
// to (membership OR named adviser). `lastMessage` is null if no one has
// chatted yet; `unreadCount` counts messages from OTHER users (never your
// own) that are newer than the caller's chat_reads.last_read_at. Works for
// members and advisers alike since chat_reads is keyed per user, not per
// membership.
export type ChatRoomSummary = {
  organization_id: string
  organization_name: string
  image_url: string | null
  lastMessage: {
    body: string
    created_at: string
    author_id: string | null
    author_name: string | null
  } | null
  unreadCount: number
}

// ── Chat tab data: every club the caller can chat in ────────────────────────
// One row per club the user is a member of OR is the named adviser/faculty
// coordinator for. Each row carries the latest message preview + timestamp +
// unread count so the list looks like Messenger / Discord.
//
// Query plan (parallel where possible):
//   1. memberships join orgs  → member clubs (+ last_read_messages_at)
//   2. organizations w/ adviser_id or faculty_coordinator_id = user → adviser clubs
//   3. For each unique club id: HEAD count of newer messages + the newest
//      message row (with author name).
//
// School-scale: a single user is in a handful of clubs, so the per-club fan-
// out is fine. Sorted newest-message-first so active chats float to the top.
export const listChatRoomsForUser = async (
  userId: string
): Promise<Result<ChatRoomSummary[]>> => {
  const [memberRes, adviserRes, readsRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('organization_id, organizations(id, name, image_url)')
      .eq('user_id', userId),
    supabase
      .from('organizations')
      .select('id, name, image_url')
      .or(`adviser_id.eq.${userId},faculty_coordinator_id.eq.${userId}`),
    // Unified read-state lookup (schema_v20) — works for members and
    // advisers alike. Missing row = "no unread".
    supabase
      .from('chat_reads')
      .select('organization_id, last_read_at')
      .eq('user_id', userId),
  ])

  if (memberRes.error) return fail(memberRes.error.message)
  if (adviserRes.error) return fail(adviserRes.error.message)
  if (readsRes.error) return fail(readsRes.error.message)

  // Build the union of clubs the caller can chat in (members + adviser-of)
  // and attach the per-club last_read_at from chat_reads.
  type RoomMeta = { id: string; name: string; image_url: string | null; lastRead: string | null }
  const rooms = new Map<string, RoomMeta>()
  const reads = new Map<string, string>()
  ;(readsRes.data ?? []).forEach((r: any) => reads.set(r.organization_id, r.last_read_at))

  for (const row of memberRes.data ?? []) {
    const r = row as any
    const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations
    if (!org) continue
    rooms.set(org.id, {
      id: org.id,
      name: org.name,
      image_url: org.image_url ?? null,
      lastRead: reads.get(org.id) ?? null,
    })
  }
  for (const row of adviserRes.data ?? []) {
    if (!rooms.has(row.id)) {
      rooms.set(row.id, {
        id: row.id,
        name: row.name,
        image_url: (row as any).image_url ?? null,
        lastRead: reads.get(row.id) ?? null,
      })
    }
  }

  if (rooms.size === 0) return ok([])

  // Per-room: latest message (with author) + unread HEAD count if we have a
  // lastRead timestamp. Run all in parallel; the total round-trip is one
  // network hop's worth of latency.
  const metas = Array.from(rooms.values())
  const perRoom = await Promise.all(
    metas.map(async (meta) => {
      const latestPromise = supabase
        .from('messages')
        .select('body, created_at, author_id, author:users!messages_author_id_fkey(full_name)')
        .eq('organization_id', meta.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Unread = messages in this club that the caller hasn't read AND did
      // NOT send. The `author_id != me` filter is the definitive fix for the
      // "I get notified for my own message" bug — you should never be badged
      // for what you said, regardless of read-tracking timing or clock skew.
      // No chat_reads row yet → count ALL messages from others (a member who
      // just joined genuinely hasn't read the backlog).
      let unreadQuery = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', meta.id)
        .neq('author_id', userId)
      if (meta.lastRead) unreadQuery = unreadQuery.gt('created_at', meta.lastRead)
      const unreadPromise = unreadQuery

      const [latest, unread] = await Promise.all([latestPromise, unreadPromise])

      const lastMsg = latest.data as any
      const authorObj = lastMsg
        ? Array.isArray(lastMsg.author)
          ? lastMsg.author[0]
          : lastMsg.author
        : null

      return {
        organization_id: meta.id,
        organization_name: meta.name,
        image_url: meta.image_url,
        lastMessage: lastMsg
          ? {
              body: lastMsg.body,
              created_at: lastMsg.created_at,
              author_id: lastMsg.author_id ?? null,
              author_name: authorObj?.full_name ?? null,
            }
          : null,
        unreadCount: unread.error ? 0 : unread.count ?? 0,
      } as ChatRoomSummary
    })
  )

  // Sort: rooms with messages first, newest message at the top. Silent rooms
  // (no messages yet) fall to the bottom in alphabetical order.
  perRoom.sort((a, b) => {
    if (a.lastMessage && b.lastMessage) {
      return b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
    }
    if (a.lastMessage) return -1
    if (b.lastMessage) return 1
    return a.organization_name.localeCompare(b.organization_name)
  })

  return ok(perRoom)
}

// ── Per-club unread message counts for the caller ───────────────────────────
// Returns a Map<orgId, count> the UI can render as a notification badge on
// each club card. Mirrors announcement.service.countUnreadForUser but keyed
// per club so the Clubs list can show per-row badges.
//
// Uses chat_reads (schema_v20) instead of memberships.last_read_messages_at
// so advisers / faculty coordinators ALSO get badges — previously they were
// silently excluded because they don't own a memberships row.
//
// Query plan:
//   1. Pull every club the caller belongs to (membership) OR advises (named
//      on the org) — same union as listChatRoomsForUser.
//   2. Pull the caller's chat_reads rows for those clubs.
//   3. For each club, count messages with created_at > last_read_at that the
//      caller did NOT send. The author_id != me filter guarantees a user is
//      never badged for their own message. No chat_reads row → count all
//      messages from others (a fresh member hasn't read the backlog).
export const countUnreadByClubForUser = async (
  userId: string
): Promise<Result<Map<string, number>>> => {
  const [memberRes, adviserRes, readsRes] = await Promise.all([
    supabase.from('memberships').select('organization_id').eq('user_id', userId),
    supabase
      .from('organizations')
      .select('id')
      .or(`adviser_id.eq.${userId},faculty_coordinator_id.eq.${userId}`),
    supabase.from('chat_reads').select('organization_id, last_read_at').eq('user_id', userId),
  ])

  if (memberRes.error) return fail(memberRes.error.message)
  if (adviserRes.error) return fail(adviserRes.error.message)
  if (readsRes.error) return fail(readsRes.error.message)

  const orgIds = new Set<string>()
  ;(memberRes.data ?? []).forEach((r: any) => orgIds.add(r.organization_id))
  ;(adviserRes.data ?? []).forEach((r: any) => orgIds.add(r.id))
  if (orgIds.size === 0) return ok(new Map())

  const reads = new Map<string, string>()
  ;(readsRes.data ?? []).forEach((r: any) => reads.set(r.organization_id, r.last_read_at))

  const results = await Promise.all(
    Array.from(orgIds).map(async (orgId) => {
      const lastRead = reads.get(orgId)
      // Count messages from OTHERS (never your own) newer than last read. If
      // there's no chat_reads row yet, count all of others' messages.
      let q = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .neq('author_id', userId)
      if (lastRead) q = q.gt('created_at', lastRead)
      const { count, error } = await q
      return { orgId, count: error ? 0 : count ?? 0 }
    })
  )

  const map = new Map<string, number>()
  results.forEach((r) => {
    if (r.count > 0) map.set(r.orgId, r.count)
  })
  return ok(map)
}

// ── Realtime: subscribe to new messages for ONE club ────────────────────────
// `onInsert` fires once per row INSERT delivered by Supabase Realtime, filtered
// server-side to messages in `organizationId`. Returns a cleanup function that
// removes the channel (call it on unmount to avoid leaking subscriptions).
//
// Note: the realtime payload contains the raw row (no joined author profile),
// so the screen is responsible for resolving the author's name from its local
// state. This keeps the realtime path zero-extra-query — important on slow
// school WiFi.
export const subscribeToMessages = (
  organizationId: string,
  onInsert: (row: ClubMessage) => void,
  onDelete?: (id: string) => void,
  onUpdate?: (row: ClubMessage) => void
): (() => void) => {
  const channel: RealtimeChannel = supabase
    .channel(`club-chat-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => onInsert(payload.new as ClubMessage)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        if (onUpdate) onUpdate(payload.new as ClubMessage)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        // DELETE payloads only include the primary key by default.
        const id = (payload.old as { id?: string })?.id
        if (id && onDelete) onDelete(id)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Message reporting (safety / moderation) — schema_v23
// ═══════════════════════════════════════════════════════════════════════════

// ── File a report against a message ─────────────────────────────────────────
// Any member of the club can flag a message. RLS forces reported_by = auth.uid()
// and verifies club membership. `reason` is a short free-text explanation.
export const reportMessage = async (
  messageId: string,
  organizationId: string,
  reportedBy: string,
  reason: string
): Promise<Result<true>> => {
  const trimmed = reason.trim()
  if (!trimmed) return fail('Please add a short reason for the report.')
  if (trimmed.length > 500) return fail('Reason is too long (max 500 characters).')

  const { error } = await supabase.from('message_reports').insert({
    message_id: messageId,
    organization_id: organizationId,
    reported_by: reportedBy,
    reason: trimmed,
  })
  if (error) return fail(error.message)
  return ok(true)
}

// ── Internal: org ids the caller moderates (officer OR adviser/faculty) ─────
// Message reports can be acted on by club officers as well as advisers/faculty,
// since officers can already delete messages. So the moderation set is the
// union of "clubs where I'm an officer" and "clubs I advise".
const getModeratedOrgIds = async (reviewerId: string): Promise<string[]> => {
  const [officerRes, adviserRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', reviewerId)
      .eq('role_in_club', 'officer'),
    supabase
      .from('organizations')
      .select('id')
      .or(`adviser_id.eq.${reviewerId},faculty_coordinator_id.eq.${reviewerId}`),
  ])
  const ids = new Set<string>()
  ;(officerRes.data ?? []).forEach((r: any) => ids.add(r.organization_id))
  ;(adviserRes.data ?? []).forEach((r: any) => ids.add(r.id))
  return Array.from(ids)
}

// ── Moderation queue: pending message reports for clubs the caller moderates ─
// Joined with the reported message (body + author) and club name. Oldest first
// so the longest-waiting reports surface at the top.
export const listPendingMessageReports = async (
  reviewerId: string
): Promise<Result<MessageReportFeedItem[]>> => {
  const orgIds = await getModeratedOrgIds(reviewerId)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('message_reports')
    .select(
      'id, message_id, organization_id, reported_by, reason, status, created_at, reviewed_by, reviewed_at, ' +
        'message:messages(id, body, author:users!messages_author_id_fkey(full_name)), ' +
        'organization:organizations(id, name), ' +
        'reporter:users!message_reports_reported_by_fkey(id, full_name)'
    )
    .in('organization_id', orgIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) return fail(error.message)

  const rows: MessageReportFeedItem[] = (data ?? []).map((r: any) => {
    const msg = oneOf<any>(r.message)
    const msgAuthor = msg ? oneOf<{ full_name: string }>(msg.author) : null
    return {
      id: r.id,
      message_id: r.message_id,
      organization_id: r.organization_id,
      reported_by: r.reported_by,
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      message: msg
        ? { id: msg.id, body: msg.body, author_name: msgAuthor?.full_name ?? null }
        : null,
      organization: oneOf<{ id: string; name: string }>(r.organization) ?? {
        id: r.organization_id,
        name: 'Club',
      },
      reporter: oneOf<{ id: string; full_name: string }>(r.reporter),
    }
  })
  return ok(rows)
}

// ── Count pending message reports (dashboard badge) ─────────────────────────
export const countPendingMessageReports = async (
  reviewerId: string
): Promise<Result<number>> => {
  const orgIds = await getModeratedOrgIds(reviewerId)
  if (orgIds.length === 0) return ok(0)
  const { count, error } = await supabase
    .from('message_reports')
    .select('id', { count: 'exact', head: true })
    .in('organization_id', orgIds)
    .eq('status', 'pending')
  if (error) return fail(error.message)
  return ok(count ?? 0)
}

// ── Resolve a report ────────────────────────────────────────────────────────
// action 'resolved' → keep the message, dismiss the report.
// action 'removed'  → delete the offending message (cascade removes its
//                     reports) then nothing else to do; if the delete fails we
//                     still mark the report removed so the queue clears.
export const resolveMessageReport = async (
  reportId: string,
  reviewerId: string,
  action: 'resolved' | 'removed',
  messageId?: string
): Promise<Result<true>> => {
  if (action === 'removed' && messageId) {
    // Deleting the message cascades to message_reports (FK on delete cascade),
    // so the report row disappears with it — the queue clears either way.
    const del = await supabase.from('messages').delete().eq('id', messageId)
    if (del.error) return fail(del.error.message)
    return ok(true)
  }

  const { error } = await supabase
    .from('message_reports')
    .update({
      status: action,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId)
  if (error) return fail(error.message)
  return ok(true)
}
