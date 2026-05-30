// ─────────────────────────────────────────────────────────────────────────────
// useRealtimeNotifications — wires the notifications service into the React
// lifecycle. Mount this once inside the authenticated app (the drawer layout)
// so it runs only while a user is signed in.
//
// On mount (with a user): configure the handler → request permission → if
// granted, subscribe to that user's realtime notifications.
// On unmount / user change: unsubscribe (cleanup), preventing duplicate
// subscriptions when switching accounts.
//
// Expo Go note: expo-notifications dropped notification support in Expo Go
// (SDK 53+), which prints a red error box and won't deliver anything. So we
// DETECT Expo Go and skip the whole flow there — the app runs clean, and
// notifications light up automatically once you run a development build.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import {
  configureNotificationHandler,
  registerPushToken,
  requestPermission,
  subscribeToUserNotifications,
} from '@/services/notifications.service'
import { isExpoGo } from '@/utils/environment'
import { useEffect } from 'react'

export function useRealtimeNotifications(): void {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    // Skip entirely in Expo Go — notifications aren't supported there and the
    // module logs a disruptive error. One quiet log instead of a red box.
    if (isExpoGo) {
      console.log(
        '[notifications] Disabled in Expo Go. Use a development build to enable device notifications.'
      )
      return
    }

    // `cancelled` guards against the async permission check resolving AFTER the
    // effect has been cleaned up (e.g. fast logout) — we don't want to
    // subscribe at that point.
    let cancelled = false
    let unsubscribe: (() => void) | undefined

    configureNotificationHandler()
    requestPermission().then((granted) => {
      if (cancelled || !granted) return
      // Register this device for remote push (chat notifications when the app
      // is closed). Fire-and-forget — no-op if EAS isn't configured yet.
      void registerPushToken(user.id)
      unsubscribe = subscribeToUserNotifications(user.id)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [user])
}
