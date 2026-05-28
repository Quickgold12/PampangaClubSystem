// ─────────────────────────────────────────────────────────────────────────────
// Membership service — officer/adviser actions on the memberships table.
//
// Audience: club officers, advisers, and faculty coordinators (gated by RLS,
// not by this file — the queries here will just fail with permission errors
// if a regular student tries to call them).
//
// Functions:
//   • addMemberByEmail  — look a user up by email, then insert a membership.
//   • removeMember      — delete a membership row.
//   • setMemberRole     — promote a member to officer, or demote back.
//   • findUserByEmail   — small helper used by the add flow.
//
// All return { data, error } so screens never need try/catch around them.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import { ClubMemberRole } from '@/types'

type Result<T> = { data: T | null; error: string | null }
const ok = <T>(data: T): Result<T> => ({ data, error: null })
const fail = <T = never>(error: string): Result<T> => ({ data: null, error })

// Add a user to a club. We look them up by exact email first so the officer
// gets a clean "User not found" message instead of an opaque FK error from
// the membership insert.
export const addMemberByEmail = async (
  orgId: string,
  email: string,
  roleInClub: ClubMemberRole = 'member'
): Promise<Result<{ membershipId: string }>> => {
  const user = await findUserByEmail(email)
  if (!user) return fail('No user found with that email. They need to sign up first.')

  const { data, error } = await supabase
    .from('memberships')
    .insert({ user_id: user.id, organization_id: orgId, role_in_club: roleInClub })
    .select('id')
    .single()

  if (error) {
    // 23505 = unique violation, our (user_id, organization_id) constraint.
    if (error.code === '23505') return fail('This user is already a member of the club.')
    return fail(error.message)
  }
  return ok({ membershipId: data.id })
}

// Remove a user from a club. Takes the user_id + org_id rather than the
// membership id so the calling screen doesn't need to track it.
export const removeMember = async (
  orgId: string,
  userId: string
): Promise<Result<true>> => {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('organization_id', orgId)
    .eq('user_id', userId)

  if (error) return fail(error.message)
  return ok(true)
}

// Promote (member → officer) or demote (officer → member). Same UPDATE either
// way — the caller decides the new role.
export const setMemberRole = async (
  orgId: string,
  userId: string,
  roleInClub: ClubMemberRole
): Promise<Result<true>> => {
  const { error } = await supabase
    .from('memberships')
    .update({ role_in_club: roleInClub })
    .eq('organization_id', orgId)
    .eq('user_id', userId)

  if (error) return fail(error.message)
  return ok(true)
}

// Internal — exact-match lookup on email. Case-insensitive (sanitize already
// lowercases in the caller, but we use ilike here as a belt-and-braces guard).
const findUserByEmail = async (email: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .ilike('email', email)
    .maybeSingle()

  if (error || !data) return null
  return data
}
