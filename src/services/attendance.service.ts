// ─────────────────────────────────────────────────────────────────────────────
// Attendance service — record + read attendance data per club.
//
// Functions:
//   • recordAttendance     — officer marks a set of members as present at one
//                            event (single batched insert).
//   • listEvents           — every event the club has held, grouped by
//                            (event_name, attended_date) with attendee count.
//   • listEventAttendees   — who showed up at one specific event.
//   • summarisePerMember   — for each club member, how many events they've
//                            attended (used by the "summary per member" tab).
//
// All return { data, error } so screens never need try/catch around them.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { AttendanceWithUser, ClubStats, EventSummary, MemberAttendanceSummary } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// ── Record attendance for an event ──────────────────────────────────────────
// One call inserts N rows (one per attendee). We rely on the unique constraint
// (organization_id, user_id, event_name, attended_date) to swallow duplicates
// gracefully — re-recording the same event just no-ops for already-marked
// users instead of erroring out.
export const recordAttendance = async (
  orgId: string,
  eventName: string,
  attendedDate: string, // ISO date, e.g. "2026-05-18"
  userIds: string[],
  recordedBy: string
): Promise<Result<{ inserted: number }>> => {
  if (userIds.length === 0) return ok({ inserted: 0 })

  const rows = userIds.map((user_id) => ({
    organization_id: orgId,
    user_id,
    event_name: eventName,
    attended_date: attendedDate,
    recorded_by: recordedBy,
  }))

  // upsert with ignoreDuplicates so re-running the action is idempotent.
  const { data, error } = await supabase
    .from('attendance')
    .upsert(rows, {
      onConflict: 'organization_id,user_id,event_name,attended_date',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) return fail(error.message)
  return ok({ inserted: data?.length ?? 0 })
}

// ── Events history ──────────────────────────────────────────────────────────
// No separate events table, so we synthesise the event list by selecting
// attendance and grouping in JS. Fine for school-scale data (≤ a few hundred
// rows per club per year). For bigger scale, swap this for a Postgres view.
export const listEvents = async (orgId: string): Promise<Result<EventSummary[]>> => {
  const { data, error } = await supabase
    .from('attendance')
    .select('event_name, attended_date')
    .eq('organization_id', orgId)

  if (error) return fail(error.message)

  // Group by composite key "name|date" — names alone aren't unique because the
  // same "Weekly Meeting" might happen many times.
  const counts = new Map<string, EventSummary>()
  for (const row of data ?? []) {
    const key = `${row.event_name}__${row.attended_date}`
    const existing = counts.get(key)
    if (existing) existing.attendee_count += 1
    else
      counts.set(key, {
        event_name: row.event_name,
        attended_date: row.attended_date,
        attendee_count: 1,
      })
  }

  // Sort newest first so the freshest events sit at the top of the screen.
  return ok(
    Array.from(counts.values()).sort((a, b) =>
      a.attended_date < b.attended_date ? 1 : -1
    )
  )
}

// ── Attendees of one event ──────────────────────────────────────────────────
// "One event" is identified by (org, name, date). We pull the user join so the
// UI can show names without a second round-trip.
export const listEventAttendees = async (
  orgId: string,
  eventName: string,
  attendedDate: string
): Promise<Result<AttendanceWithUser[]>> => {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, organization_id, user_id, event_name, attended_date, recorded_by, created_at, user:users!attendance_user_id_fkey(id, full_name)')
    .eq('organization_id', orgId)
    .eq('event_name', eventName)
    .eq('attended_date', attendedDate)

  if (error) return fail(error.message)

  // Normalise the joined user — Supabase may return it as array or object
  // depending on relationship inference.
  const rows = (data ?? []).map((r: any) => ({
    ...r,
    user: Array.isArray(r.user) ? r.user[0] : r.user,
  })) as AttendanceWithUser[]

  return ok(rows)
}

// ── Per-member summary ──────────────────────────────────────────────────────
// For each current member of the club, how many distinct events they've shown
// up to. Two queries: one for the member roster (so we include zero-attendance
// members in the result) and one for the attendance counts.
export const summarisePerMember = async (
  orgId: string
): Promise<Result<MemberAttendanceSummary[]>> => {
  const [membersRes, attendanceRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('user_id, users:users!memberships_user_id_fkey(id, full_name)')
      .eq('organization_id', orgId),
    supabase
      .from('attendance')
      .select('user_id')
      .eq('organization_id', orgId),
  ])

  if (membersRes.error) return fail(membersRes.error.message)
  if (attendanceRes.error) return fail(attendanceRes.error.message)

  // Tally attendance counts keyed by user_id.
  const counts = new Map<string, number>()
  for (const row of attendanceRes.data ?? []) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
  }

  const summaries: MemberAttendanceSummary[] = (membersRes.data ?? [])
    .map((m: any) => {
      const user = Array.isArray(m.users) ? m.users[0] : m.users
      if (!user) return null
      return {
        user_id: user.id,
        full_name: user.full_name,
        attended_count: counts.get(user.id) ?? 0,
      }
    })
    .filter((x: MemberAttendanceSummary | null): x is MemberAttendanceSummary => x !== null)
    // Highest attendance first so the most engaged members are visible.
    .sort((a, b) => b.attended_count - a.attended_count)

  return ok(summaries)
}

// ── Club statistics ─────────────────────────────────────────────────────────
// Computed from memberships + attendance:
//   • memberCount    — current members of the club.
//   • activeMembers  — DISTINCT members who attended ≥1 recorded event.
//   • eventsHeld     — DISTINCT events (event_name + attended_date) recorded.
//   • attendanceRate — average attendees per event ÷ member count, as 0–100.
//                      = totalAttendanceMarks / (eventsHeld × memberCount).
// Two small queries; folded client-side (cheap at school scale).
export const getClubStats = async (orgId: string): Promise<Result<ClubStats>> => {
  const [membersRes, attendanceRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('user_id', { count: 'exact' })
      .eq('organization_id', orgId),
    supabase
      .from('attendance')
      .select('user_id, event_name, attended_date')
      .eq('organization_id', orgId),
  ])

  if (membersRes.error) return fail(membersRes.error.message)
  if (attendanceRes.error) return fail(attendanceRes.error.message)

  const memberCount = membersRes.count ?? (membersRes.data?.length ?? 0)
  const attendance = attendanceRes.data ?? []

  // Distinct members who showed up at least once.
  const activeSet = new Set<string>()
  // Distinct events (name + date together — same name can recur).
  const eventSet = new Set<string>()
  for (const row of attendance) {
    activeSet.add(row.user_id)
    eventSet.add(`${row.event_name}__${row.attended_date}`)
  }

  const eventsHeld = eventSet.size
  const totalMarks = attendance.length
  // Guard divide-by-zero: no events or no members → 0%.
  const attendanceRate =
    eventsHeld > 0 && memberCount > 0
      ? Math.round((totalMarks / (eventsHeld * memberCount)) * 100)
      : 0

  return ok({
    memberCount,
    activeMembers: activeSet.size,
    eventsHeld,
    attendanceRate,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// QR check-in (schema_v27)
// ═══════════════════════════════════════════════════════════════════════════

// One open check-in session. The officer screen renders `id` as a QR code.
export type CheckinSession = {
  id: string
  organization_id: string
  event_name: string
  event_date: string
  expires_at: string
}

// ── Officer: open a check-in session for an event ───────────────────────────
// RLS limits inserts to officers/advisers of the club. Returns the new session
// (its id becomes the QR payload). event_date defaults to today server-side.
export const createCheckinSession = async (
  orgId: string,
  eventName: string,
  createdBy: string
): Promise<Result<CheckinSession>> => {
  const name = eventName.trim()
  if (!name) return fail('Give the event a name first.')
  if (name.length > 120) return fail('Event name is too long.')

  const { data, error } = await supabase
    .from('checkin_sessions')
    .insert({ organization_id: orgId, event_name: name, created_by: createdBy })
    .select('id, organization_id, event_name, event_date, expires_at')
    .single()

  if (error) return fail(error.message)
  return ok(data as CheckinSession)
}

// ── Officer: close a session early (deletes it; the QR stops working) ───────
export const closeCheckinSession = async (sessionId: string): Promise<Result<true>> => {
  const { error } = await supabase.from('checkin_sessions').delete().eq('id', sessionId)
  if (error) return fail(error.message)
  return ok(true)
}

// ── Officer: live count of who has checked in for this session's event ──────
// Counts attendance rows matching the session's (org, event, date). Lets the
// officer watch check-ins roll in on the QR screen.
export const countCheckedIn = async (session: CheckinSession): Promise<Result<number>> => {
  const { count, error } = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', session.organization_id)
    .eq('event_name', session.event_name)
    .eq('attended_date', session.event_date)
  if (error) return fail(error.message)
  return ok(count ?? 0)
}

// ── Member: check in by scanning a QR (session id) ──────────────────────────
// Calls the SECURITY DEFINER check_in RPC, which validates the session +
// membership and records attendance. Returns the event name on success.
// The RPC raises "checkin:"-prefixed errors; we strip the prefix for display.
export const checkInWithSession = async (sessionId: string): Promise<Result<string>> => {
  const { data, error } = await supabase.rpc('check_in', { p_session_id: sessionId })
  if (error) {
    const marker = 'checkin:'
    const i = error.message.indexOf(marker)
    return fail(i === -1 ? error.message : error.message.slice(i + marker.length).trim())
  }
  return ok((data as string) ?? 'Event')
}

// ═══════════════════════════════════════════════════════════════════════════
// Club analytics (officer/adviser dashboard)
// ═══════════════════════════════════════════════════════════════════════════

// A single labelled bar for the analytics charts.
export type AnalyticsBar = { label: string; value: number }

export type ClubAnalytics = {
  stats: ClubStats
  attendanceByEvent: AnalyticsBar[] // most recent events, oldest → newest
  memberGrowth: AnalyticsBar[] // cumulative member count by month
  topAttendees: { name: string; count: number }[] // top 5 most-active members
}

// How many bars to show in each chart (keeps small-screen labels readable).
const MAX_ANALYTICS_BARS = 8

// "2026-05-18" → "5/18"
const eventLabel = (isoDate: string): string => {
  const [, m, d] = isoDate.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

// ISO timestamp → "YYYY-MM" bucket key.
const monthKey = (iso: string): string => iso.slice(0, 7)

// "2026-05" → "5/26"
const monthLabel = (key: string): string => {
  const [y, m] = key.split('-')
  return `${parseInt(m, 10)}/${y.slice(2)}`
}

// ── Aggregate everything the analytics screen needs ─────────────────────────
// Composes the existing stats/events/per-member helpers plus one membership
// query for the growth series. All run in parallel.
export const getClubAnalytics = async (orgId: string): Promise<Result<ClubAnalytics>> => {
  const [statsRes, eventsRes, perMemberRes, growthRes] = await Promise.all([
    getClubStats(orgId),
    listEvents(orgId),
    summarisePerMember(orgId),
    supabase.from('memberships').select('joined_at').eq('organization_id', orgId),
  ])

  if (statsRes.error || !statsRes.data) return fail(statsRes.error ?? 'Could not load stats.')
  if (eventsRes.error) return fail(eventsRes.error)
  if (perMemberRes.error) return fail(perMemberRes.error)
  if (growthRes.error) return fail(growthRes.error.message)

  // Attendance per event — listEvents is newest-first; take the most recent N
  // and reverse so the chart reads left (older) → right (newer).
  const attendanceByEvent: AnalyticsBar[] = (eventsRes.data ?? [])
    .slice(0, MAX_ANALYTICS_BARS)
    .reverse()
    .map((e) => ({ label: eventLabel(e.attended_date), value: e.attendee_count }))

  // Member growth — bucket joins by month, accumulate across ALL months, then
  // keep the most recent N bars (so the running total still reflects earlier
  // months trimmed off the front of the chart).
  const byMonth = new Map<string, number>()
  for (const row of (growthRes.data ?? []) as { joined_at: string }[]) {
    const key = monthKey(row.joined_at)
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1)
  }
  let running = 0
  const cumulativeAll: AnalyticsBar[] = Array.from(byMonth.keys())
    .sort()
    .map((m) => {
      running += byMonth.get(m) ?? 0
      return { label: monthLabel(m), value: running }
    })
  const memberGrowth = cumulativeAll.slice(-MAX_ANALYTICS_BARS)

  const topAttendees = (perMemberRes.data ?? [])
    .slice(0, 5)
    .map((m) => ({ name: m.full_name, count: m.attended_count }))

  return ok({ stats: statsRes.data, attendanceByEvent, memberGrowth, topAttendees })
}
