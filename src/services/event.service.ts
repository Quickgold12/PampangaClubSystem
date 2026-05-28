// ─────────────────────────────────────────────────────────────────────────────
// Event service — scheduled club events (the calendar).
//
// Functions:
//   • listForClub          — every event for one club, soonest upcoming first.
//   • listUpcomingForUser  — upcoming events across all the user's clubs, for
//                            the home dashboard widget.
//   • createEvent          — officer/adviser schedules an event.
//   • deleteEvent          — creator or adviser removes an event.
//
// All return { data, error }. RLS enforces who can read/write.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { ClubEvent, EventFeedItem } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// Today's date in ISO (YYYY-MM-DD) for "upcoming" comparisons.
const todayISO = () => new Date().toISOString().slice(0, 10)

// ── List one club's events ──────────────────────────────────────────────────
// Returned ascending by date so the screen can split into upcoming/past easily.
export const listForClub = async (orgId: string): Promise<Result<ClubEvent[]>> => {
  const { data, error } = await supabase
    .from('events')
    .select('id, organization_id, title, description, location, event_date, event_time, created_by, created_at')
    .eq('organization_id', orgId)
    .order('event_date', { ascending: true })

  if (error) return fail(error.message)
  return ok((data ?? []) as ClubEvent[])
}

// ── Upcoming events across the user's clubs (dashboard widget) ──────────────
// Pull membership org-ids first, then events on/after today in those orgs,
// soonest first, capped to `limit`.
export const listUpcomingForUser = async (
  userId: string,
  limit = 5
): Promise<Result<EventFeedItem[]>> => {
  const memberships = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)

  if (memberships.error) return fail(memberships.error.message)
  const orgIds = (memberships.data ?? []).map((r: any) => r.organization_id)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('events')
    .select('id, organization_id, title, description, location, event_date, event_time, created_by, created_at, organization:organizations(id, name)')
    .in('organization_id', orgIds)
    .gte('event_date', todayISO())
    .order('event_date', { ascending: true })
    .limit(limit)

  if (error) return fail(error.message)

  const oneOf = <T>(v: T | T[] | null | undefined): T | null =>
    !v ? null : Array.isArray(v) ? v[0] ?? null : v

  const rows: EventFeedItem[] = (data ?? []).map((r: any) => ({
    ...r,
    organization: oneOf(r.organization),
  }))
  return ok(rows)
}

// ── All events across the user's clubs (global calendar tab) ────────────────
// Like listUpcomingForUser but with NO date filter — returns past + future so
// the calendar screen can show an "Upcoming / Past" agenda. Ordered ascending
// by date; the screen splits the two groups.
export const listAllForUser = async (userId: string): Promise<Result<EventFeedItem[]>> => {
  const memberships = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId)

  if (memberships.error) return fail(memberships.error.message)
  const orgIds = (memberships.data ?? []).map((r: any) => r.organization_id)
  if (orgIds.length === 0) return ok([])

  const { data, error } = await supabase
    .from('events')
    .select('id, organization_id, title, description, location, event_date, event_time, created_by, created_at, organization:organizations(id, name)')
    .in('organization_id', orgIds)
    .order('event_date', { ascending: true })

  if (error) return fail(error.message)

  const oneOf = <T>(v: T | T[] | null | undefined): T | null =>
    !v ? null : Array.isArray(v) ? v[0] ?? null : v

  const rows: EventFeedItem[] = (data ?? []).map((r: any) => ({
    ...r,
    organization: oneOf(r.organization),
  }))
  return ok(rows)
}

// ── Create an event ─────────────────────────────────────────────────────────
// `createdBy` MUST equal auth.uid() per RLS; passed explicitly.
export const createEvent = async (params: {
  orgId: string
  title: string
  description?: string
  location?: string
  eventDate: string // ISO date "YYYY-MM-DD"
  eventTime?: string
  createdBy: string
}): Promise<Result<{ id: string }>> => {
  const { data, error } = await supabase
    .from('events')
    .insert({
      organization_id: params.orgId,
      title: params.title,
      description: params.description ?? null,
      location: params.location ?? null,
      event_date: params.eventDate,
      event_time: params.eventTime ?? null,
      created_by: params.createdBy,
    })
    .select('id')
    .single()

  if (error) return fail(error.message)
  return ok({ id: data.id })
}

// ── Delete an event ─────────────────────────────────────────────────────────
// RLS limits this to the creator or the club's adviser/faculty coordinator.
export const deleteEvent = async (id: string): Promise<Result<true>> => {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) return fail(error.message)
  return ok(true)
}
