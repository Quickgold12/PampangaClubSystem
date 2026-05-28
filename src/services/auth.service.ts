// All authentication API calls in one place
// FIX: renamed from auth.services.ts → auth.service.ts to match the import paths used by the (auth) screens.

import { supabase } from '@/services/supabase'
import { UserRole } from '@/types'
import * as Linking from 'expo-linking'

type SignUpParams = {
  email: string
  password: string
  fullName: string
  role: UserRole
}

type AuthResult = {
  success: boolean
  error?: string
}

export const signIn = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export const signUp = async ({
  email,
  password,
  fullName,
  role,
}: SignUpParams): Promise<AuthResult> => {
  // Step 1: Create auth account
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (signUpError) return { success: false, error: signUpError.message }
  if (!data.user) return { success: false, error: 'Signup failed. Please try again.' }

  // Step 2: Create user profile
  const { error: profileError } = await supabase.from('users').insert({
    id: data.user.id,
    full_name: fullName,
    email,
    role,
  })

  if (profileError) {
    // TEMP (debugging): surface the actual Postgres error so we can see what
    // step 2 is really failing on (missing table? RLS policy? bad column?).
    // Revert to the friendly message once signup works end-to-end.
    return {
      success: false,
      error: `Profile setup failed: ${profileError.message} (code: ${profileError.code ?? 'n/a'})`,
    }
  }

  return { success: true }
}

export const signOut = async (): Promise<void> => {
  await supabase.auth.signOut()
}

// ── Password recovery — step 1: send the reset email ────────────────────────
// Supabase emails the user a magic link. `redirectTo` is a deep link back into
// THIS app (scheme "pampangaclubsystem", see app.json) pointing at the
// reset-password screen. When the user taps the link, the app opens with a
// recovery session and AuthContext routes them to set a new password.
//
// Note: for the deep link to work in a dev build you must add the redirect URL
// to Supabase → Authentication → URL Configuration → Redirect URLs. See README.
export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  const redirectTo = Linking.createURL('/reset-password')
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Password recovery — step 2: set the new password ────────────────────────
// Called from the reset-password screen. Only works while the user is in a
// recovery session (i.e. they arrived via the email link). Supabase ties the
// updateUser call to that temporary session.
export const updatePassword = async (newPassword: string): Promise<AuthResult> => {
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export const fetchUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, email, avatar_url')
    .eq('id', userId)
    .single()

  if (error) return null
  return data
}

// Update the user's own profile row. Editable: full_name + avatar_url. Email is
// managed by Supabase Auth; role is set at signup and only an admin should
// change it. RLS limits this to the user's own row.
export const updateProfile = async (
  userId: string,
  updates: { full_name?: string; avatar_url?: string | null }
): Promise<AuthResult> => {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Change password while logged in ─────────────────────────────────────────
// Supabase's updateUser() does NOT require the current password, which would
// let anyone with an unlocked phone change it silently. To guard against that
// we first RE-VERIFY the current password by attempting a sign-in with it.
// Only if that succeeds do we set the new password.
export const changePassword = async (
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<AuthResult> => {
  // 1. Verify the current password. signInWithPassword refreshes the session
  //    for the same user (no sign-out), and fails if the password is wrong.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (verifyError) {
    return { success: false, error: 'Your current password is incorrect.' }
  }

  // 2. Set the new password on the now-verified session.
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
  if (updateError) return { success: false, error: updateError.message }

  return { success: true }
}