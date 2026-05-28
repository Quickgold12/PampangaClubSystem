// ─────────────────────────────────────────────────────────────────────────────
// Events & Stats screen — the club's activity calendar + statistics.
//
// What this screen does:
//   • Stats card at the top: attendance rate, active members, events held
//     (computed from attendance + memberships via getClubStats).
//   • Composer (officers/advisers): schedule an event (title, date, time,
//     location, description).
//   • Agenda calendar: "Upcoming" events (today onward, soonest first) and
//     "Past" events (before today, most recent first), each a card. Creator/
//     adviser can delete.
//
// "Calendar" here is an agenda list rather than a month grid — lighter, and
// reads naturally on a phone. Members see everything read-only.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import { DateField, TimeField } from '@/components/common/DateField'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { getClubStats } from '@/services/attendance.service'
import { getClubDetail } from '@/services/clubs.service'
import { createEvent, deleteEvent, listForClub } from '@/services/event.service'
import { ClubDetail, ClubEvent, ClubStats } from '@/types'
import { sanitizeText } from '@/utils/sanitize'
import { Stack, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

const todayISO = () => new Date().toISOString().slice(0, 10)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export default function EventsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [stats, setStats] = useState<ClubStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Composer state.
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState(todayISO())
  const [eventTime, setEventTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, eventsRes, statsRes] = await Promise.all([
      getClubDetail(id),
      listForClub(id),
      getClubStats(id),
    ])
    if (clubRes.data) setClub(clubRes.data)
    if (eventsRes.data) setEvents(eventsRes.data)
    if (statsRes.data) setStats(statsRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const canEdit =
    !!user &&
    !!club &&
    (user.id === club.adviser_id ||
      user.id === club.faculty_coordinator_id ||
      club.members.some((m) => m.id === user.id && m.role_in_club === 'officer'))

  // Split events into upcoming (today onward, ascending) and past (descending).
  const { upcoming, past } = useMemo(() => {
    const today = todayISO()
    const up: ClubEvent[] = []
    const pa: ClubEvent[] = []
    for (const e of events) {
      if (e.event_date >= today) up.push(e)
      else pa.push(e)
    }
    // events arrive ascending; past should read newest-first.
    pa.reverse()
    return { upcoming: up, past: pa }
  }, [events])

  const handleCreate = async () => {
    if (!id || !user) return
    const cleanTitle = sanitizeText(title)
    if (!cleanTitle) {
      Alert.alert('Missing title', 'Give the event a title.')
      return
    }
    if (!DATE_REGEX.test(eventDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD, e.g. 2026-05-30.')
      return
    }
    setCreating(true)
    const { error } = await createEvent({
      orgId: id,
      title: cleanTitle,
      description: sanitizeText(description) || undefined,
      location: sanitizeText(location) || undefined,
      eventDate,
      eventTime: sanitizeText(eventTime) || undefined,
      createdBy: user.id,
    })
    setCreating(false)
    if (error) {
      Alert.alert('Could not create', error)
      return
    }
    setTitle('')
    setEventTime('')
    setLocation('')
    setDescription('')
    await load()
  }

  const handleDelete = (eventId: string, label: string) => {
    Alert.alert('Delete event?', `"${label}" will be removed from the calendar.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setEvents((prev) => prev.filter((e) => e.id !== eventId))
          const { error } = await deleteEvent(eventId)
          if (error) {
            Alert.alert('Delete failed', error)
            load()
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }
  if (!club) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Club not found.</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Events', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Events</Text>
        </View>

        {/* ── Club statistics card ── */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Club Statistics</Text>
            <View style={styles.statsRow}>
              <Stat value={`${stats.attendanceRate}%`} label="Attendance" />
              <Stat value={`${stats.activeMembers}/${stats.memberCount}`} label="Active" />
              <Stat value={String(stats.eventsHeld)} label="Events Held" />
            </View>
          </View>
        )}

        {/* ── Composer (officers/advisers) ── */}
        {canEdit && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Schedule Event</Text>
            <Input label="Title" placeholder="General Assembly" value={title} onChangeText={setTitle} editable={!creating} />
            <DateField label="Date" value={eventDate} onChange={setEventDate} editable={!creating} />
            <TimeField label="Time (optional)" value={eventTime} onChange={setEventTime} editable={!creating} />
            <Input label="Location (optional)" placeholder="Audio-Visual Room" value={location} onChangeText={setLocation} editable={!creating} />
            <Input
              label="Description (optional)"
              placeholder="What's happening?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              editable={!creating}
              style={styles.descInput}
            />
            <Button label="Add Event" onPress={handleCreate} loading={creating} />
          </View>
        )}

        {/* ── Upcoming ── */}
        <Text style={styles.sectionLabel}>Upcoming</Text>
        {upcoming.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No upcoming events.</Text>
          </View>
        ) : (
          upcoming.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              upcoming
              canDelete={canEdit}
              onDelete={() => handleDelete(e.id, e.title)}
            />
          ))
        )}

        {/* ── Past ── */}
        {past.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, styles.pastLabel]}>Past</Text>
            {past.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                upcoming={false}
                canDelete={canEdit}
                onDelete={() => handleDelete(e.id, e.title)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </>
  )
}

// One stat in the statistics card (big value + small label).
function Stat({ value, label }: { value: string; label: string }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSubLabel}>{label}</Text>
    </View>
  )
}

// One event card. Past events render dimmed; upcoming ones get the brand date chip.
function EventCard({
  event,
  upcoming,
  canDelete,
  onDelete,
}: {
  event: ClubEvent
  upcoming: boolean
  canDelete: boolean
  onDelete: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={[styles.eventCard, !upcoming && styles.eventCardPast]}>
      <View style={[styles.dateChip, upcoming ? styles.dateChipUpcoming : styles.dateChipPast]}>
        <Text style={[styles.dateChipDay, upcoming && styles.dateChipDayUpcoming]}>{dayOf(event.event_date)}</Text>
        <Text style={[styles.dateChipMonth, upcoming && styles.dateChipMonthUpcoming]}>{monthOf(event.event_date)}</Text>
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventMeta}>
          {fullDate(event.event_date)}
          {event.event_time ? ` • ${event.event_time}` : ''}
        </Text>
        {event.location ? <Text style={styles.eventMeta}>📍 {event.location}</Text> : null}
        {event.description ? <Text style={styles.eventDesc}>{event.description}</Text> : null}
        {canDelete && (
          <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteLink} accessibilityRole="button">
            <Text style={styles.deleteLinkText}>Delete</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

// Date helpers for the chip + meta line.
const dayOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '?' : String(d.getDate())
}
const monthOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short' })
}
const fullDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
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
    // Stats card.
    statsCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    statsLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.md,
    },
    statsRow: { flexDirection: 'row', gap: t.space.md },
    stat: { flex: 1 },
    statValue: { fontSize: t.font.size.h2, lineHeight: t.font.lineHeight.h2, fontWeight: t.font.weight.bold, color: t.color.accent },
    statSubLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    // Composer.
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    cardLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.md,
    },
    descInput: { minHeight: 70, textAlignVertical: 'top' },
    sectionLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    pastLabel: { marginTop: t.space.lg },
    // Event card with a left date chip.
    eventCard: {
      flexDirection: 'row',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.md,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
      gap: t.space.md,
    },
    eventCardPast: { opacity: 0.7 },
    dateChip: {
      width: 52,
      borderRadius: t.radius.md,
      paddingVertical: t.space.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateChipUpcoming: { backgroundColor: t.color.brandSubtle },
    dateChipPast: { backgroundColor: t.color.surfaceMuted },
    dateChipDay: { fontSize: t.font.size.h3, fontWeight: t.font.weight.bold, color: t.color.textMuted },
    dateChipDayUpcoming: { color: t.color.brandPressed },
    dateChipMonth: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      color: t.color.textMuted,
    },
    dateChipMonthUpcoming: { color: t.color.brandPressed },
    eventBody: { flex: 1 },
    eventTitle: { fontSize: t.font.size.body, fontWeight: t.font.weight.semibold, color: t.color.text, marginBottom: 2 },
    eventMeta: { fontSize: t.font.size.bodySm, color: t.color.textMuted },
    eventDesc: { fontSize: t.font.size.bodySm, color: t.color.text, marginTop: t.space.xs },
    deleteLink: { marginTop: t.space.sm, alignSelf: 'flex-start' },
    deleteLinkText: { fontSize: t.font.size.caption, color: t.color.danger, fontWeight: t.font.weight.semibold },
    empty: { paddingVertical: t.space.xl, alignItems: 'center' },
    emptyText: { color: t.color.textSubtle, fontSize: t.font.size.body, textAlign: 'center' },
  })
