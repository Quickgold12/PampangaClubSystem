// ─────────────────────────────────────────────────────────────────────────────
// Clubs service — everything the UI needs to talk to the `organizations`,
// `memberships`, and `join_requests` tables.
//
// Functions are grouped by audience:
//   • Public reads (any signed-in user):
//       listClubs            — feed for the browse-clubs screen
//       getClubDetail        — name + description + adviser + members
//   • Adviser / faculty actions:
//       createClub           — create a new organization
//       updateClub           — edit name/description
//   • Student actions:
//       requestToJoin        — create a pending join request
//       getMyRequests        — student's own request history
//   • Officer / adviser actions:
//       getPendingForReviewer — every pending request the caller can act on
//       approveRequest        — flip to 'approved' AND create a membership row
//       rejectRequest         — flip to 'rejected' (no membership)
//       listOfficerClubs      — clubs where the caller is an officer
//
// Every function returns `{ data, error }` so screens can handle the failure
// case without try/catch noise. `error` is a user-safe string (we never surface
// raw Postgres errors to the UI).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import {
  ClubDetail,
  ClubMemberRole,
  JoinRequestWithOrg,
  JoinRequestWithUser,
  Organization,
  UserRole,
} from '@/types'

// Shape of every service response. `data` is null on failure, `error` is null on success.
type Result<T> = { data: T | null; error: string | null }

const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// ── Create a club ───────────────────────────────────────────────────────────
// Only advisers / faculty coordinators may create clubs (enforced by RLS in
// schema_v8.sql). The creator is recorded on the new row in the slot matching
// their role:
//   • adviser            → adviser_id = creator
//   • faculty_coordinator → faculty_coordinator_id = creator
// The other slot is left null and can be filled later. Returns the new club id.
export const createClub = async (params: {
  name: string
  description: string
  creatorId: string
  creatorRole: UserRole
}): Promise<Result<{ id: string }>> => {
  // Guard in the client too (RLS is the real gate, but a clear message beats a
  // generic permission error).
  if (params.creatorRole !== 'adviser' && params.creatorRole !== 'faculty_coordinator') {
    return fail('Only advisers and faculty coordinators can create clubs.')
  }

  const row: Record<string, unknown> = {
    name: params.name,
    description: params.description,
  }
  if (params.creatorRole === 'adviser') row.adviser_id = params.creatorId
  else row.faculty_coordinator_id = params.creatorId

  const { data, error } = await supabase
    .from('organizations')
    .insert(row)
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id })
}

// ── Update a club's editable fields ─────────────────────────────────────────
// RLS restricts updates to the club's own adviser/faculty coordinator OR any
// faculty coordinator (the cross-club admin path added in schema_v15.sql).
// Editable fields: name, description, cover image_url, and ownership columns
// (adviser_id, faculty_coordinator_id) — the last two are gated by RLS to
// faculty coordinators in practice.
export const updateClub = async (
  orgId: string,
  updates: {
    name?: string
    description?: string
    image_url?: string | null
    adviser_id?: string | null
    faculty_coordinator_id?: string | null
  }
): Promise<Result<true>> => {
  const { error } = await supabase.from('organizations').update(updates).eq('id', orgId)
  if (error) return fail(error.message)
  return ok(true)
}

// ── List all users with the 'adviser' app-wide role ─────────────────────────
// Used by the faculty "Assign Adviser" picker. Note: schema_v7's "users
// readable by authenticated" policy makes this readable to faculty.
export const listAdvisers = async (): Promise<
  Result<Array<{ id: string; full_name: string; email: string }>>
> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('role', 'adviser')
    .order('full_name', { ascending: true })

  if (error) return fail(error.message)
  return ok(data ?? [])
}

// ── Browse: all clubs with their current member counts ──────────────────────
// member_count comes from a Postgres aggregate via the foreign-table count
// trick (`memberships(count)`), so we don't need a separate query per row.
export const listClubs = async (): Promise<Result<Organization[]>> => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, description, adviser_id, faculty_coordinator_id, created_at, image_url, memberships(count)')
    .order('name', { ascending: true })

  if (error) return fail(error.message)

  const clubs: Organization[] = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    adviser_id: row.adviser_id,
    faculty_coordinator_id: row.faculty_coordinator_id,
    created_at: row.created_at,
    image_url: row.image_url ?? null,
    // Supabase returns `memberships: [{ count: N }]` for the aggregate.
    member_count: row.memberships?.[0]?.count ?? 0,
  }))

  return ok(clubs)
}

// ── Club detail page: org row + adviser profile + member list ───────────────
// Two queries instead of one big nested select — easier to reason about and
// keeps the types clean. Both run in parallel via Promise.all.
export const getClubDetail = async (orgId: string): Promise<Result<ClubDetail>> => {
  const [orgRes, membersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, description, adviser_id, faculty_coordinator_id, created_at, image_url, adviser:users!organizations_adviser_id_fkey(id, full_name)')
      .eq('id', orgId)
      .single(),
    supabase
      .from('memberships')
      .select('role_in_club, users:users!memberships_user_id_fkey(id, full_name, role)')
      .eq('organization_id', orgId),
  ])

  if (orgRes.error) return fail(orgRes.error.message)
  if (membersRes.error) return fail(membersRes.error.message)

  const org = orgRes.data as any
  const memberRows = (membersRes.data ?? []) as any[]

  // Supabase sometimes returns single-FK joined rows as a 1-element array
  // instead of an object — coerce so callers always see a single record.
  const oneOf = <T>(value: T | T[] | null | undefined): T | null => {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
  }

  const adviser = oneOf<{ id: string; full_name: string }>(org.adviser)

  const detail: ClubDetail = {
    id: org.id,
    name: org.name,
    description: org.description,
    adviser_id: org.adviser_id,
    faculty_coordinator_id: org.faculty_coordinator_id,
    created_at: org.created_at,
    image_url: org.image_url ?? null,
    member_count: memberRows.length,
    adviser: adviser ? { id: adviser.id, full_name: adviser.full_name } : null,
    members: memberRows
      .map((m) => ({ row: m, user: oneOf<any>(m.users) }))
      .filter(({ user }) => !!user) // drop rows where the joined user is missing
      .map(({ row, user }) => ({
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        role_in_club: row.role_in_club as ClubMemberRole,
      })),
  }

  return ok(detail)
}

// ── Student: send a join request ────────────────────────────────────────────
// Schema's partial unique index already blocks duplicate PENDING rows, but we
// also check for an existing membership first so the user gets a clean message
// ("You're already a member") instead of a constraint error.
export const requestToJoin = async (
  userId: string,
  orgId: string,
  message?: string
): Promise<Result<{ id: string }>> => {
  const { data: existingMember, error: memberCheckError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (memberCheckError) return fail(memberCheckError.message)
  if (existingMember) return fail('You are already a member of this club.')

  const { data, error } = await supabase
    .from('join_requests')
    .insert({
      user_id: userId,
      organization_id: orgId,
      message: message ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    // Unique-constraint violation = a pending request already exists.
    if (error.code === '23505') return fail('You already have a pending request for this club.')
    return fail(error.message)
  }
  return ok({ id: data.id })
}

// ── Student: list my own join requests (pending + history) ──────────────────
// Ordered newest-first so the most recent action sits at the top of the screen.
export const getMyRequests = async (userId: string): Promise<Result<JoinRequestWithOrg[]>> => {
  const { data, error } = await supabase
    .from('join_requests')
    .select('id, user_id, organization_id, status, message, requested_at, reviewed_at, reviewed_by, organization:organizations(id, name)')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })

  if (error) return fail(error.message)
  return ok((data ?? []) as unknown as JoinRequestWithOrg[])
}

// ── Officer / adviser: pending queue for clubs the caller can review ────────
// "Can review" = caller is a student officer in the club OR the club's adviser
// OR its faculty coordinator. We resolve the set of reviewable org ids first,
// then pull the pending requests for those orgs.
export const getPendingForReviewer = async (
  reviewerId: string
): Promise<Result<JoinRequestWithUser[]>> => {
  const orgIds = await getReviewableOrgIds(reviewerId)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('join_requests')
    .select('id, user_id, organization_id, status, message, requested_at, reviewed_at, reviewed_by, user:users!join_requests_user_id_fkey(id, full_name), organization:organizations(id, name)')
    .in('organization_id', orgIds)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true }) // oldest first — "first in, first reviewed"

  if (error) return fail(error.message)
  return ok((data ?? []) as unknown as JoinRequestWithUser[])
}

// ── Officer / adviser: approve ──────────────────────────────────────────────
// Two writes in sequence (Supabase JS doesn't expose transactions):
//   1. Flip the request to 'approved'.
//   2. Look up the joiner's app-wide role. If they signed up as a "Club
//      Officer", they're auto-granted officer status in this club. Otherwise
//      they join as a regular member. Advisers/faculty don't go through this
//      flow (they're set directly on the org row).
//   3. Insert the corresponding membership row.
// If step 3 fails we revert step 1 so the request doesn't get stuck.
export const approveRequest = async (
  requestId: string,
  reviewerId: string
): Promise<Result<true>> => {
  const { data: req, error: fetchError } = await supabase
    .from('join_requests')
    .select('id, user_id, organization_id, status')
    .eq('id', requestId)
    .single()

  if (fetchError) return fail(fetchError.message)
  if (req.status !== 'pending') return fail('This request has already been reviewed.')

  const { error: updateError } = await supabase
    .from('join_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq('id', requestId)
    .eq('status', 'pending') // belt-and-braces: don't overwrite a concurrent update

  if (updateError) return fail(updateError.message)

  // Auto-elevate to 'officer' if the joiner's app-wide role is 'club_officer'.
  // This saves the adviser from manually promoting every officer signup —
  // their role choice at signup carries through to the membership.
  const { data: userProfile } = await supabase
    .from('users')
    .select('role')
    .eq('id', req.user_id)
    .maybeSingle()
  const memberRole: 'officer' | 'member' =
    userProfile?.role === 'club_officer' ? 'officer' : 'member'

  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ user_id: req.user_id, organization_id: req.organization_id, role_in_club: memberRole })

  if (membershipError) {
    // Roll back the status flip so a future approve attempt can retry.
    await supabase
      .from('join_requests')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null })
      .eq('id', requestId)
    return fail(membershipError.message)
  }

  return ok(true)
}

// ── Officer / adviser: reject ───────────────────────────────────────────────
// Simple status flip — no membership row created. Student can re-apply later
// because the partial unique index only covers status='pending'.
export const rejectRequest = async (
  requestId: string,
  reviewerId: string
): Promise<Result<true>> => {
  const { error } = await supabase
    .from('join_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: reviewerId })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) return fail(error.message)
  return ok(true)
}

// ── Per-user membership map (powers the per-club badge on the Clubs list) ──
// Returns Map<organization_id, 'officer' | 'member'> so the Clubs screen can
// stamp each card with the user's role in THAT club at a glance — much
// clearer than tapping into every card to find out.
export const listMyMembershipMap = async (
  userId: string
): Promise<Result<Map<string, 'officer' | 'member'>>> => {
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role_in_club')
    .eq('user_id', userId)

  if (error) return fail(error.message)

  const map = new Map<string, 'officer' | 'member'>()
  for (const m of data ?? []) {
    map.set(m.organization_id, m.role_in_club as 'officer' | 'member')
  }
  return ok(map)
}

// ── Adviser dashboard: "Clubs You Advise" strip ────────────────────────────
// Returns the clubs where the user is the named adviser OR faculty
// coordinator. Used by the home dashboard so an adviser sees their own clubs
// front-and-center and can jump straight in with one tap.
export const listAdviserClubs = async (
  userId: string
): Promise<Result<Array<Pick<Organization, 'id' | 'name'>>>> => {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    // Postgrest .or() takes a comma-separated string of conditions.
    .or(`adviser_id.eq.${userId},faculty_coordinator_id.eq.${userId}`)
    .order('name', { ascending: true })

  if (error) return fail(error.message)
  return ok((data ?? []) as Array<Pick<Organization, 'id' | 'name'>>)
}

// ── Officer dashboard: "Your Officer Clubs" strip ──────────────────────────
// Returns the clubs where the user holds an officer membership (role_in_club
// = 'officer'). Used by the home dashboard to render quick-links into the
// clubs where the user has elevated power. Adviser-only clubs are NOT
// included here — those clubs don't typically appear in a student officer's
// "my clubs as officer" list.
export const listOfficerClubs = async (
  userId: string
): Promise<Result<Array<Pick<Organization, 'id' | 'name'>>>> => {
  const { data, error } = await supabase
    .from('memberships')
    .select('organization:organizations(id, name)')
    .eq('user_id', userId)
    .eq('role_in_club', 'officer')

  if (error) return fail(error.message)

  // Normalise the joined org row (object vs single-element array — same trick
  // we use elsewhere for FK joins) and drop any rows whose join missed.
  const oneOf = <T>(value: T | T[] | null | undefined): T | null => {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
  }

  const clubs = (data ?? [])
    .map((m: any) => oneOf<{ id: string; name: string }>(m.organization))
    .filter((o): o is { id: string; name: string } => o !== null)

  return ok(clubs)
}

// ── Internal helper ─────────────────────────────────────────────────────────
// Returns every organization id the caller is authorised to moderate, by
// unioning (a) clubs where they're a student officer with (b) clubs where
// they're the adviser or faculty coordinator. Both lookups go out in parallel.
const getReviewableOrgIds = async (reviewerId: string): Promise<string[]> => {
  const [officerRes, advisedRes] = await Promise.all([
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
  ;(advisedRes.data ?? []).forEach((r: any) => ids.add(r.id))
  return Array.from(ids)
}
