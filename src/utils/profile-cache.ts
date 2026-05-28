// ─────────────────────────────────────────────────────────────────────────────
// profile-cache — tiny SecureStore-backed cache for the user's profile row.
//
// Why this exists: without it, every app launch waits for a network round-trip
// before the dashboard can show the user's name, causing a brief "Hello" flash
// (or full-screen spinner). With it, the LAST known profile is read from
// device storage synchronously on startup, so the name renders on the first
// frame. A fresh fetch still runs in the background and overwrites the cache.
//
// Keyed by user.id so multiple logins on the same device don't bleed into
// each other. expo-secure-store on native, localStorage on web — same pattern
// as the supabase StorageAdapter.
// ─────────────────────────────────────────────────────────────────────────────

import { Profile } from '@/types'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const isWeb = Platform.OS === 'web'
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const keyFor = (userId: string) => `profile_cache_${userId}`

// Reads + writes go through the same platform-aware code path as the supabase
// session storage, so behaviour is consistent across native + web.
const read = async (key: string): Promise<string | null> => {
  if (isWeb && isBrowser) return window.localStorage.getItem(key)
  if (!isWeb) return SecureStore.getItemAsync(key)
  return null
}
const write = async (key: string, value: string): Promise<void> => {
  if (isWeb && isBrowser) {
    window.localStorage.setItem(key, value)
    return
  }
  if (!isWeb) await SecureStore.setItemAsync(key, value)
}
const remove = async (key: string): Promise<void> => {
  if (isWeb && isBrowser) {
    window.localStorage.removeItem(key)
    return
  }
  if (!isWeb) await SecureStore.deleteItemAsync(key)
}

// Read the cached profile for a given user. Returns null if nothing's stored
// or the stored data is corrupted (best-effort — we never throw).
export const getCachedProfile = async (userId: string): Promise<Profile | null> => {
  try {
    const raw = await read(keyFor(userId))
    if (!raw) return null
    return JSON.parse(raw) as Profile
  } catch {
    return null
  }
}

// Persist the profile so the next app open can render the name without a
// network call. Called from AuthContext.fetchProfile after a successful fetch.
export const cacheProfile = async (profile: Profile): Promise<void> => {
  try {
    await write(keyFor(profile.id), JSON.stringify(profile))
  } catch {
    // Swallow — caching is best-effort, never block the UI on a failure.
  }
}

// Clear the cache for a specific user. Called on sign-out so the next user's
// session doesn't accidentally see the previous user's name.
export const clearProfileCache = async (userId: string): Promise<void> => {
  try {
    await remove(keyFor(userId))
  } catch {
    // Best-effort.
  }
}
