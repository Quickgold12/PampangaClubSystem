// ─────────────────────────────────────────────────────────────────────────────
// Calendar tab — month grid + per-day events + reminders.
//
// What this screen does:
//   • Shows a month-grid calendar (react-native-calendars). Days that have an
//     event in any of the user's clubs get a dot marker.
//   • Tapping a day selects it and lists that day's events below the grid.
//   • On load it (re)schedules local reminders 2 days before each upcoming
//     event (dev build only — skipped in Expo Go, see notifications.service).
//
// Events come from listAllForUser (every club the user belongs to). Tapping an
// event opens that club's Events screen where officers can edit.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { listAllForUser } from '@/services/event.service'
import { scheduleEventReminders } from '@/services/notifications.service'
import { EventFeedItem } from '@/types'
import { isExpoGo } from '@/utils/environment'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Calendar, type DateData } from 'react-native-calendars'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function CalendarScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [selected, setSelected] = useState<string>(todayISO())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await listAllForUser(user.id)
    const list = data ?? []
    setEvents(list)

    // (Re)schedule reminders for upcoming events. Dev build only — calling this
    // in Expo Go would import the unsupported native module, so we gate it.
    if (!isExpoGo) {
      const today = todayISO()
      const upcoming = list
        .filter((e) => e.event_date >= today)
        .map((e) => ({
          id: e.id,
          title: e.title,
          event_date: e.event_date,
          organizationName: e.organization.name,
        }))
      scheduleEventReminders(upcoming).catch(() => {
        // Non-fatal — reminders are best-effort.
      })
    }
  }, [user])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Build the markedDates object for the grid: a dot on every day that has an
  // event, plus the selection highlight on the chosen day.
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {}
    for (const e of events) {
      marks[e.event_date] = {
        ...(marks[e.event_date] ?? {}),
        marked: true,
        dotColor: theme.color.brand,
      }
    }
    // Merge selection onto the selected day (keep its dot if it has one).
    marks[selected] = {
      ...(marks[selected] ?? {}),
      selected: true,
      selectedColor: theme.color.brand,
      selectedTextColor: theme.color.onBrand,
    }
    return marks
  }, [events, selected, theme])

  // Events on the selected day.
  const dayEvents = useMemo(
    () => events.filter((e) => e.event_date === selected),
    [events, selected]
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>All Clubs</Text>
        <Text style={styles.title}>Calendar</Text>
      </View>

      {/* Month grid. Theme keys are mapped to our design tokens so it matches
          the rest of the app (brand selection, amber accents, warm surface). */}
      <View style={styles.calendarCard}>
        <Calendar
          current={selected}
          markedDates={markedDates}
          onDayPress={(day: DateData) => setSelected(day.dateString)}
          enableSwipeMonths
          theme={{
            calendarBackground: theme.color.surface,
            monthTextColor: theme.color.text,
            textSectionTitleColor: theme.color.textMuted,
            dayTextColor: theme.color.text,
            todayTextColor: theme.color.brandPressed,
            textDisabledColor: theme.color.textDisabled,
            arrowColor: theme.color.brandPressed,
            dotColor: theme.color.brand,
            selectedDayBackgroundColor: theme.color.brand,
            selectedDayTextColor: theme.color.onBrand,
          }}
        />
      </View>

      {/* Selected-day events. */}
      <Text style={styles.sectionLabel}>{formatSelected(selected)}</Text>
      {dayEvents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No events on this day.</Text>
        </View>
      ) : (
        dayEvents.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => router.push(`/club/${e.organization.id}/events` as never)}
            style={({ pressed }) => [styles.eventCard, pressed && styles.eventCardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`${e.title} in ${e.organization.name}`}
          >
            <Text style={styles.eventTitle}>{e.title}</Text>
            <Text style={styles.eventMeta}>
              {e.organization.name}
              {e.event_time ? ` • ${e.event_time}` : ''}
            </Text>
            {e.location ? <Text style={styles.eventMeta}>📍 {e.location}</Text> : null}
            {e.description ? <Text style={styles.eventDesc}>{e.description}</Text> : null}
          </Pressable>
        ))
      )}

      {/* Reminder hint — sets expectations about when notifications fire. */}
      <Text style={styles.footnote}>
        You&apos;ll be reminded 2 days before each upcoming event.
      </Text>
    </ScrollView>
  )
}

// "Saturday, May 30, 2026" for the selected-day section header.
const formatSelected = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.color.background },
    container: { flexGrow: 1, padding: t.space.xl, backgroundColor: t.color.background },
    header: { marginBottom: t.space.lg },
    eyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.accent,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    title: { fontSize: t.font.size.h1, lineHeight: t.font.lineHeight.h1, fontWeight: t.font.weight.bold, color: t.color.text },
    // Wraps the grid so it gets the card border/shadow treatment.
    calendarCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.sm,
      marginBottom: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
      overflow: 'hidden',
    },
    sectionLabel: {
      fontSize: t.font.size.bodySm,
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
      marginBottom: t.space.sm,
    },
    eventCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    eventCardPressed: { backgroundColor: t.color.surfaceMuted },
    eventTitle: { fontSize: t.font.size.body, fontWeight: t.font.weight.semibold, color: t.color.text, marginBottom: 2 },
    eventMeta: { fontSize: t.font.size.bodySm, color: t.color.textMuted },
    eventDesc: { fontSize: t.font.size.bodySm, color: t.color.text, marginTop: t.space.xs },
    empty: { paddingVertical: t.space.xl, alignItems: 'center' },
    emptyText: { color: t.color.textSubtle, fontSize: t.font.size.body, textAlign: 'center' },
    footnote: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      textAlign: 'center',
      marginTop: t.space.lg,
    },
  })
