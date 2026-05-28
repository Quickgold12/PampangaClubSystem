import { supabase } from '@/services/supabase'
import { Profile } from '@/types'
import { cacheProfile, clearProfileCache, getCachedProfile } from '@/utils/profile-cache'
import { Session, User } from '@supabase/supabase-js'
import React, { createContext, useContext, useEffect, useState } from 'react'

type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  // True while the user is in a password-RECOVERY session (arrived via the
  // reset-password email link). The root layout uses this to route them to
  // the reset-password screen instead of into the app.
  isRecovering: boolean
  signOut: () => Promise<void>
  // Re-fetches the current user's profile row. Call after editing the profile
  // so the new name/etc. propagates to every consumer (drawer footer, etc.).
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isRecovering: false,
  signOut: async () => {},
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  // Set true when Supabase fires PASSWORD_RECOVERY (the user opened the reset
  // link). Cleared on sign-out. The root layout reads this to route to the
  // reset-password screen.
  const [isRecovering, setIsRecovering] = useState(false)

  const fetchProfile = async (userId: string) => {
    // maybeSingle() so "no row found" returns null instead of erroring — we
    // log + bail in that case (orphan/missing row needs SQL repair, see chat).
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, role, email, avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.warn('[Auth] fetchProfile error:', error.message)
      return
    }
    if (!data) {
      console.warn('[Auth] No profile row for user', userId, '— DB repair needed')
      return
    }

    const profileRow = data as Profile

    // Self-repair: if full_name is empty (e.g. created via a half-failed
    // signup), set it to the email prefix in place. UPDATE-only (never
    // INSERT) so we can't hit the orphan-row duplicate-key bug. The user's
    // own RLS policy "users update own row" allows this.
    if (!profileRow.full_name || !profileRow.full_name.trim()) {
      const fallback = (profileRow.email ?? '').split('@')[0] || 'User'
      const { data: updated } = await supabase
        .from('users')
        .update({ full_name: fallback })
        .eq('id', userId)
        .select('id, full_name, role, email, avatar_url')
        .maybeSingle()
      if (updated) {
        const repaired = updated as Profile
        setProfile(repaired)
        cacheProfile(repaired)
        return
      }
    }

    setProfile(profileRow)
    // Persist so the NEXT app open can render the name on the first frame
    // without waiting for this network call. Fire-and-forget — never blocks.
    cacheProfile(profileRow)
  }

  const handleSession = (newSession: Session | null) => {
    setSession(newSession)
    setUser(newSession?.user ?? null)

    if (newSession?.user) {
      const uid = newSession.user.id
      // Read the cached profile (if any) and apply it IMMEDIATELY so the
      // dashboard greeting can render the user's name without waiting for
      // a network round-trip. The fresh fetchProfile() below overwrites it
      // once the server's truth arrives.
      getCachedProfile(uid).then((cached) => {
        if (cached) setProfile(cached)
      })
      fetchProfile(uid)
    } else {
      setProfile(null)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      handleSession(initialSession)
      setLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, newSession: Session | null) => {
        // PASSWORD_RECOVERY fires when the app opens from a reset-password
        // email link. Flag it so the root layout routes to reset-password
        // instead of dropping the (now temporarily authenticated) user into
        // the app.
        if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
        handleSession(newSession)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    // Cache clear is fire-and-forget — never let SecureStore stall block
    // the sign-out flow on devices where it's misbehaving.
    if (user) clearProfileCache(user.id).catch(() => {})

    // supabase.auth.signOut() defaults to a 'global' scope that does a
    // network call. If that errors (offline / stale session / server hiccup),
    // we don't want the user stranded "logged-in locally with no way out".
    // Swallow the error and force-clear local state below regardless.
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.warn('[Auth] signOut network call failed; clearing local state anyway:', e)
    }

    // Force local state clear. Normally onAuthStateChange would do this for
    // us when the SIGNED_OUT event fires, but if signOut errored before
    // emitting the event we still want a clean slate. The root layout's auth
    // gate watches `session` and will redirect to /(auth)/login when it
    // sees null.
    setSession(null)
    setUser(null)
    setProfile(null)
    setIsRecovering(false)
  }

  // Public re-fetch — used by the profile editor after a successful update so
  // the drawer footer and dashboard greeting reflect the new name immediately.
  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, isRecovering, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)