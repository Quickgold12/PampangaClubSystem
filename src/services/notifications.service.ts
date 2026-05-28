// ─────────────────────────────────────────────────────────────────────────────
// Notifications service — in-app device notifications via Supabase Realtime.
//
// This is "local notifications driven by realtime", NOT remote push:
//   • The app subscribes to Postgres change events through Supabase Realtime.
//   • When a relevant change arrives WHILE THE APP IS RUNNING (foreground or
//     backgrounded), we schedule an immediate LOCAL notification.
//   • It will NOT wake a fully-closed app — that needs true remote push.
//
// Three event types are handled (all respect RLS — a user only receives change
// events for rows they're allowed to read):
//   1. New approved announcement in a club you belong to.
//   2. Your submitted report being approved or rejected.
//   3. Your join request being approved (or rejected).
//
// ── Why expo-notifications is LAZY-LOADED ────────────────────────────────────
// Importing 'expo-notifications' at module load runs a side-effect
// (PushTokenAutoRegistration) that throws a hard error in Expo Go (SDK 53+).
// That error fires before any of our guards can run. So we DON'T statically
// import it — `loadNotifications()` imports it on first use, and the only
// caller (useRealtimeNotifications) skips this whole service in Expo Go. Net
// effect: Expo Go never loads the module, never sees the error.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/services/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { Platform } from 'react-native'

// Type-only import (erased at compile time — does NOT pull the module in at
// runtime). The real module is fetched by loadNotifications() below.
type NotificationsModule = typeof import('expo-notifications')

let cachedModule: NotificationsModule | null = null

// Dynamically import expo-notifications the first time it's needed. Because
// this is a dynamic import(), the module's import-time side-effects only run
// when this is actually called — never at app startup, never in Expo Go.
const loadNotifications = async (): Promise<NotificationsModule> => {
  if (!cachedModule) cachedModule = await import('expo-notifications')
  return cachedModule
}

// ── Foreground display behaviour ────────────────────────────────────────────
// By default notifications are suppressed while the app is foregrounded; we
// override so they show regardless. Async now because the module is lazy.
export const configureNotificationHandler = async (): Promise<void> => {
  const Notifications = await loadNotifications()
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
}

// ── Permission + Android channel ────────────────────────────────────────────
// Android needs a channel registered before anything shows. Returns whether we
// have permission to post notifications.
export const requestPermission = async (): Promise<boolean> => {
  const Notifications = await loadNotifications()

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  const settings = await Notifications.getPermissionsAsync()
  if (settings.granted) return true

  const request = await Notifications.requestPermissionsAsync()
  return request.granted
}

// Fire an immediate local notification (trigger: null = now). Fire-and-forget
// from the realtime callbacks below.
const notify = async (title: string, body: string): Promise<void> => {
  const Notifications = await loadNotifications()
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  })
}

// How many days before an event the reminder fires.
const REMINDER_DAYS_BEFORE = 2
// Hour of day (local) the reminder fires on the reminder day.
const REMINDER_HOUR = 9

// Minimal event shape the reminder scheduler needs.
export type ReminderEvent = {
  id: string
  title: string
  event_date: string // ISO date "YYYY-MM-DD"
  organizationName: string
}

// ── Schedule "event is coming up" reminders ─────────────────────────────────
// For each upcoming event, schedules ONE local notification at REMINDER_HOUR on
// the day REMINDER_DAYS_BEFORE before the event. We cancel all previously
// scheduled notifications first and reschedule from the current list, so the
// set always matches the latest events (idempotent — safe to call on every
// calendar load). Reminders whose fire-time is already in the past are skipped.
//
// Caller MUST gate this with isExpoGo (these scheduled notifications need a dev
// build). The realtime "immediate" notify() above uses trigger:null and isn't a
// "scheduled" notification, so cancelAll only clears reminders, not those.
export const scheduleEventReminders = async (events: ReminderEvent[]): Promise<void> => {
  const Notifications = await loadNotifications()

  // Clear the previous reminder set so we never double-schedule.
  await Notifications.cancelAllScheduledNotificationsAsync()

  const now = Date.now()
  for (const event of events) {
    // Build the reminder datetime: REMINDER_DAYS_BEFORE days before, at REMINDER_HOUR.
    const fireAt = new Date(`${event.event_date}T00:00:00`)
    if (Number.isNaN(fireAt.getTime())) continue
    fireAt.setDate(fireAt.getDate() - REMINDER_DAYS_BEFORE)
    fireAt.setHours(REMINDER_HOUR, 0, 0, 0)

    // Skip reminders whose time has already passed.
    if (fireAt.getTime() <= now) continue

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Upcoming event',
        body: `${event.title} (${event.organizationName}) is in ${REMINDER_DAYS_BEFORE} days.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    })
  }
}

// ── Subscribe to the three event types ──────────────────────────────────────
// One Realtime channel with three postgres_changes listeners. Returns a
// cleanup function that removes the channel. (No expo-notifications needed to
// SET UP the subscription — only the `notify` calls inside touch it.)
export const subscribeToUserNotifications = (userId: string): (() => void) => {
  const channel: RealtimeChannel = supabase
    .channel(`user-notifications-${userId}`)

    // 1. New announcements. RLS limits delivery to clubs the user can read, so
    //    we only filter out non-approved posts and the user's own posts.
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'announcements' },
      (payload) => {
        const row = payload.new as { status?: string; posted_by?: string; title?: string }
        if (row.status !== 'approved') return
        if (row.posted_by === userId) return
        void notify('New announcement', row.title ?? 'A new announcement was posted.')
      }
    )

    // 2. A report the user submitted is reviewed.
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'reports',
        filter: `submitted_by=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as { status?: string; title?: string }
        if (row.status === 'approved') {
          void notify('Report approved', `Your report "${row.title ?? ''}" was approved.`)
        } else if (row.status === 'rejected') {
          void notify('Report rejected', `Your report "${row.title ?? ''}" was rejected.`)
        }
      }
    )

    // 3. The user's join request is decided.
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'join_requests',
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const row = payload.new as { status?: string; organization_id?: string }
        if (row.status === 'approved') {
          const clubName = await fetchClubName(row.organization_id)
          void notify(
            'Request approved',
            clubName ? `You've been accepted into ${clubName}!` : 'Your join request was approved!'
          )
        } else if (row.status === 'rejected') {
          void notify('Request declined', 'Your join request was not approved this time.')
        }
      }
    )
    .subscribe()

  // Cleanup — drop the channel so we don't leak subscriptions across logins.
  return () => {
    supabase.removeChannel(channel)
  }
}

// ── Internal: look up a club name for the join-request message ───────────────
const fetchClubName = async (orgId?: string): Promise<string | null> => {
  if (!orgId) return null
  const { data, error } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()
  if (error || !data) return null
  return data.name
}
