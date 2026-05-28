// ─────────────────────────────────────────────────────────────────────────────
// Faculty service — school-wide oversight for faculty coordinators.
//
// Functions:
//   • getSchoolOverview      — aggregate school stats + per-club activity rows
//                              (powers the overview, inactive-club monitor, and
//                              the manage-all-clubs list — all from one fetch).
//   • generateSchoolReportPdf — a PDF summary of every club for sharing/printing.
//
// All reads here rely on the faculty school-wide RLS policies (schema_v14.sql)
// plus the already-world-readable organizations + memberships tables. A
// non-faculty caller would simply get partial/empty activity data (RLS), so the
// UI also gates entry to faculty coordinators.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { ClubActivity, SchoolOverview } from '@/types'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

const oneOf = <T>(v: T | T[] | null | undefined): T | null =>
  !v ? null : Array.isArray(v) ? v[0] ?? null : v

// Whole days from an ISO date string to today (0 if today or in the future).
const daysSince = (iso: string): number => {
  const then = new Date(`${iso}T00:00:00`).getTime()
  if (Number.isNaN(then)) return 0
  const diff = Date.now() - then
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000)
}

// Reduce an ISO timestamp/date to just the date part for activity comparison.
const dateOnly = (v: string): string => v.slice(0, 10)

// ── School overview ─────────────────────────────────────────────────────────
// One batch of queries, folded client-side. At school scale (dozens of clubs,
// hundreds of activity rows) this is well within budget and avoids N+1.
export const getSchoolOverview = async (): Promise<Result<SchoolOverview>> => {
  const [orgsRes, membersRes, annRes, eventsRes, attRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, adviser:users!organizations_adviser_id_fkey(full_name)')
      .order('name', { ascending: true }),
    supabase.from('memberships').select('organization_id, user_id'),
    supabase.from('announcements').select('organization_id, posted_at'),
    supabase.from('events').select('organization_id, event_date'),
    supabase.from('attendance').select('organization_id, attended_date'),
  ])

  if (orgsRes.error) return fail(orgsRes.error.message)
  if (membersRes.error) return fail(membersRes.error.message)
  if (annRes.error) return fail(annRes.error.message)
  if (eventsRes.error) return fail(eventsRes.error.message)
  if (attRes.error) return fail(attRes.error.message)

  const orgs = orgsRes.data ?? []
  const memberships = membersRes.data ?? []
  const announcements = annRes.data ?? []
  const events = eventsRes.data ?? []
  const attendance = attRes.data ?? []

  // Member counts + distinct members.
  const memberCountByOrg = new Map<string, number>()
  const distinctMembers = new Set<string>()
  for (const m of memberships) {
    memberCountByOrg.set(m.organization_id, (memberCountByOrg.get(m.organization_id) ?? 0) + 1)
    distinctMembers.add(m.user_id)
  }

  // Latest activity date per org across the three signals.
  const lastActivityByOrg = new Map<string, string>()
  const bump = (orgId: string, isoDate: string) => {
    const d = dateOnly(isoDate)
    const cur = lastActivityByOrg.get(orgId)
    if (!cur || d > cur) lastActivityByOrg.set(orgId, d)
  }
  for (const a of announcements) bump(a.organization_id, a.posted_at)
  for (const e of events) bump(e.organization_id, e.event_date)
  for (const a of attendance) bump(a.organization_id, a.attended_date)

  const clubs: ClubActivity[] = orgs.map((o: any) => {
    const adviser = oneOf<{ full_name: string }>(o.adviser)
    const lastActivity = lastActivityByOrg.get(o.id) ?? null
    return {
      id: o.id,
      name: o.name,
      adviserName: adviser?.full_name ?? null,
      memberCount: memberCountByOrg.get(o.id) ?? 0,
      lastActivity,
      daysSinceActivity: lastActivity ? daysSince(lastActivity) : null,
    }
  })

  return ok({
    stats: {
      clubCount: orgs.length,
      distinctMembers: distinctMembers.size,
      totalEvents: events.length,
      totalAnnouncements: announcements.length,
    },
    clubs,
  })
}

// ── School-wide PDF report ──────────────────────────────────────────────────
// Renders an HTML table of every club (members, last activity, status) to a
// PDF and opens the share sheet. `inactiveDays` flags clubs with no activity in
// that many days (or never) as "Inactive" in the status column.
export const generateSchoolReportPdf = async (
  overview: SchoolOverview,
  inactiveDays = 30
): Promise<Result<true>> => {
  try {
    const html = buildSchoolReportHtml(overview, inactiveDays)
    const { uri } = await Print.printToFileAsync({ html })
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'School-wide Club Report',
        UTI: 'com.adobe.pdf',
      })
    }
    return ok(true)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not generate the PDF.')
  }
}

const buildSchoolReportHtml = (overview: SchoolOverview, inactiveDays: number): string => {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const fmtDate = (iso: string | null) => {
    if (!iso) return 'Never'
    const d = new Date(`${iso}T00:00:00`)
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  const isInactive = (c: { daysSinceActivity: number | null }) =>
    c.daysSinceActivity === null || c.daysSinceActivity > inactiveDays

  const rows = overview.clubs
    .map(
      (c) => `
        <tr>
          <td>${esc(c.name)}</td>
          <td>${esc(c.adviserName ?? '—')}</td>
          <td style="text-align:center">${c.memberCount}</td>
          <td>${fmtDate(c.lastActivity)}</td>
          <td class="${isInactive(c) ? 'inactive' : 'active'}">${isInactive(c) ? 'Inactive' : 'Active'}</td>
        </tr>`
    )
    .join('')

  const generatedOn = new Date().toLocaleString('en-PH')
  const { stats } = overview

  return `
    <html><head><meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, Roboto, sans-serif; color: #171717; padding: 24px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .sub { color: #737373; font-size: 12px; margin: 0 0 20px; }
        .summary { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .box { border: 1px solid #E5E0D5; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
        .box .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #737373; }
        .box .value { font-size: 18px; font-weight: 700; margin-top: 4px; color: #B45309; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; border-bottom: 2px solid #E5E0D5; padding: 8px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #737373; }
        td { border-bottom: 1px solid #F0EBE0; padding: 8px 6px; }
        .active { color: #15803D; font-weight: 600; }
        .inactive { color: #B91C1C; font-weight: 600; }
      </style>
    </head><body>
      <h1>Pampanga High School — Club Report</h1>
      <p class="sub">Generated ${generatedOn} • inactivity threshold: ${inactiveDays} days</p>
      <div class="summary">
        <div class="box"><div class="label">Clubs</div><div class="value">${stats.clubCount}</div></div>
        <div class="box"><div class="label">Students</div><div class="value">${stats.distinctMembers}</div></div>
        <div class="box"><div class="label">Events</div><div class="value">${stats.totalEvents}</div></div>
        <div class="box"><div class="label">Announcements</div><div class="value">${stats.totalAnnouncements}</div></div>
      </div>
      <table>
        <thead><tr><th>Club</th><th>Adviser</th><th style="text-align:center">Members</th><th>Last Activity</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="color:#737373;padding:16px 6px">No clubs.</td></tr>'}</tbody>
      </table>
    </body></html>`
}
