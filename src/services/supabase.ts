import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// 🔒 Safe localStorage check for web
const isWeb = Platform.OS === 'web'
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const StorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb && isBrowser) {
      return window.localStorage.getItem(key)
    }
    if (!isWeb) {
      return SecureStore.getItemAsync(key)
    }
    return null
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb && isBrowser) {
      window.localStorage.setItem(key, value)
      return
    }
    if (!isWeb) {
      await SecureStore.setItemAsync(key, value)
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (isWeb && isBrowser) {
      window.localStorage.removeItem(key)
      return
    }
    if (!isWeb) {
      await SecureStore.deleteItemAsync(key)
    }
  },
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: StorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})