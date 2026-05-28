// ─────────────────────────────────────────────────────────────────────────────
// Attendance overview screen — two views in one screen, switched by a header
// segmented control:
//
//   • "Events" tab:
//       Every event the club has held, newest first, with the attendee count.
//       Tapping an event expands it inline to show who attended.
//   • "Members" tab:
//       Per-member roll-up — name + how many events they've shown up to.
//       Highest attendance first, so engaged members are visible.
//
// Visible to anyone who can read attendance under RLS (members + officers +
// advisers). Recording new attendance lives on a separate screen.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import {
  listEventAttendees,
  listEvents,
  summarisePerMember,
} from '@/services/attendance.service'
import {
  AttendanceWithUser,
  EventSummary,
  MemberAttendanceSummary,
} from '@/types'
import { Stack, useLocalSearchParams } from 'expo-router'
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

type Tab = 'events' | 'members'

export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [tab, setTab] = useState<Tab>('events')
  const [events, setEvents] = useState<EventSummary[]>([])
  const [members, setMembers] = useState<MemberAttendanceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Cache of attendees per event so re-expanding doesn't re-fetch. Keyed by
  // "name__date" — same key shape as the service uses internally.
  const [attendees, setAttendees] = useState<Record<string, AttendanceWithUser[]>>({})
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    // Pull both views in parallel — they're independent.
    const [evRes, memRes] = await Promise.all([listEvents(id), summarisePerMember(id)])
    if (evRes.data) setEvents(evRes.data)
    if (memRes.data) setMembers(memRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    // Invalidate the attendee cache too — counts may have changed.
    setAttendees({})
    setExpandedKey(null)
    await load()
    setRefreshing(false)
  }, [load])

  // Expanding an event lazily fetches its attendees (only once per session).
  const handleToggleEvent = async (event: EventSummary) => {
    const key = `${event.event_name}__${event.attended_date}`
    if (expandedKey === key) {
      setExpandedKey(null)
      return
    }
    setExpandedKey(key)
    if (!attendees[key] && id) {
      const { data } = await listEventAttendees(id, event.event_name, event.attended_date)
      if (data) setAttendees((prev) => ({ ...prev, [key]: data }))
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Attendance', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Club</Text>
          <Text style={styles.title}>Attendance</Text>
        </View>

        {/* Segmented control to swap between the two views. */}
        <View style={styles.tabBar}>
          <TabButton label="Events" active={tab === 'events'} onPress={() => setTab('events')} />
          <TabButton label="Members" active={tab === 'members'} onPress={() => setTab('members')} />
        </View>

        {tab === 'events' ? (
          events.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No events recorded yet.</Text>
            </View>
          ) : (
            events.map((ev) => {
              const key = `${ev.event_name}__${ev.attended_date}`
              const isOpen = expandedKey === key
              const rows = attendees[key]
              return (
                <Pressable
                  key={key}
                  onPress={() => handleToggleEvent(ev)}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${ev.event_name}, expand attendees`}
                >
                  <Text style={styles.cardTitle}>{ev.event_name}</Text>
                  <Text style={styles.cardMeta}>
                    {formatDate(ev.attended_date)} • {ev.attendee_count}{' '}
                    {ev.attendee_count === 1 ? 'attendee' : 'attendees'}
                  </Text>
                  {/* Inline expansion: who actually showed up. */}
                  {isOpen && (
                    <View style={styles.attendeeList}>
                      {rows === undefined ? (
                        <ActivityIndicator color={theme.color.brand} />
                      ) : rows.length === 0 ? (
                        <Text style={styles.bodyMuted}>No attendees.</Text>
                      ) : (
                        rows.map((r) => (
                          <Text key={r.id} style={styles.attendeeName}>
                            • {r.user.full_name}
                          </Text>
                        ))
                      )}
                    </View>
                  )}
                </Pressable>
              )
            })
          )
        ) : members.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No members to summarise.</Text>
          </View>
        ) : (
          members.map((m) => (
            <View key={m.user_id} style={styles.card}>
              <Text style={styles.cardTitle}>{m.full_name}</Text>
              <Text style={styles.cardMeta}>
                {m.attended_count} {m.attended_count === 1 ? 'event' : 'events'} attended
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </>
  )
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  )
}

// Local date formatter, same as the requests screen — kept inline to avoid
// reaching for a date library for a one-line job.
const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.background,
    },
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    header: {
      marginBottom: t.space.lg,
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    title: {
      fontSize: t.font.size.h1,
      lineHeight: t.font.lineHeight.h1,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: t.color.surfaceMuted,
      borderRadius: t.radius.md,
      padding: 4,
      marginBottom: t.space.md,
    },
    tabButton: {
      flex: 1,
      paddingVertical: t.space.sm,
      alignItems: 'center',
      borderRadius: t.radius.sm,
    },
    tabButtonActive: {
      backgroundColor: t.color.surface,
      ...t.shadow.card,
    },
    tabButtonText: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      fontWeight: t.font.weight.medium,
    },
    tabButtonTextActive: {
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    cardPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    cardTitle: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    cardMeta: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    attendeeList: {
      marginTop: t.space.sm,
      paddingTop: t.space.sm,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    attendeeName: {
      fontSize: t.font.size.bodySm,
      color: t.color.text,
      paddingVertical: 2,
    },
    bodyMuted: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    empty: {
      paddingVertical: t.space['3xl'],
      alignItems: 'center',
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
    },
  })
