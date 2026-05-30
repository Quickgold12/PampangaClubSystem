// ─────────────────────────────────────────────────────────────────────────────
// Club Analytics — officers / advisers / faculty only.
//
// Visual insights built from the club's attendance + membership data:
//   • Four headline stat tiles (members, active, events held, attendance rate)
//   • Attendance per recent event (bar chart)
//   • Cumulative member growth by month (bar chart)
//   • Most-active members (top 5)
//
// Access is gated in the UI by computing the caller's role for THIS club from
// the fetched detail (officer membership OR named adviser/faculty). The
// underlying tables also enforce RLS, so this is defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────
import BarChart from '@/components/common/BarChart'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { ClubAnalytics, getClubAnalytics } from '@/services/attendance.service'
import { getClubDetail } from '@/services/clubs.service'
import { ClubDetail } from '@/types'
import { Stack, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

export default function ClubAnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [analytics, setAnalytics] = useState<ClubAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, statsRes] = await Promise.all([getClubDetail(id), getClubAnalytics(id)])
    if (clubRes.data) setClub(clubRes.data)
    if (statsRes.data) setAnalytics(statsRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const canView = useMemo(() => {
    if (!user || !club) return false
    if (user.id === club.adviser_id || user.id === club.faculty_coordinator_id) return true
    return club.members.some((m) => m.id === user.id && m.role_in_club === 'officer')
  }, [user, club])

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
        <Text style={styles.muted}>Club not found.</Text>
      </View>
    )
  }

  if (!canView) {
    return (
      <>
        <Stack.Screen options={{ title: 'Analytics', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>Only officers and advisers can view analytics.</Text>
        </View>
      </>
    )
  }

  const a = analytics

  return (
    <>
      <Stack.Screen options={{ title: 'Analytics', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.heading}>{club.name}</Text>
        <Text style={styles.subheading}>Club analytics</Text>

        {/* Headline stat tiles. */}
        <View style={styles.tileRow}>
          <StatTile label="Members" value={a?.stats.memberCount ?? 0} />
          <StatTile label="Active" value={a?.stats.activeMembers ?? 0} />
        </View>
        <View style={styles.tileRow}>
          <StatTile label="Events Held" value={a?.stats.eventsHeld ?? 0} />
          <StatTile label="Attendance" value={`${a?.stats.attendanceRate ?? 0}%`} />
        </View>

        {/* Attendance per recent event. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Attendance per event</Text>
          <Text style={styles.cardHint}>Most recent events</Text>
          <BarChart data={a?.attendanceByEvent ?? []} />
        </View>

        {/* Cumulative member growth. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Member growth</Text>
          <Text style={styles.cardHint}>Total members by month</Text>
          <BarChart data={a?.memberGrowth ?? []} color={theme.color.success} />
        </View>

        {/* Most-active members. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Most active members</Text>
          {a && a.topAttendees.length > 0 ? (
            a.topAttendees.map((m, i) => (
              <View key={`${m.name}-${i}`} style={styles.rankRow}>
                <Text style={styles.rankNum}>{i + 1}</Text>
                <Text style={styles.rankName} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={styles.rankCount}>
                  {m.count} {m.count === 1 ? 'event' : 'events'}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No attendance recorded yet.</Text>
          )}
        </View>
      </ScrollView>
    </>
  )
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.background,
      padding: t.space.xl,
    },
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    heading: {
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    subheading: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginBottom: t.space.lg,
    },
    tileRow: {
      flexDirection: 'row',
      gap: t.space.md,
      marginBottom: t.space.md,
    },
    tile: {
      flex: 1,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    tileValue: {
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    tileLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginTop: t.space.xs,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginTop: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    cardLabel: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    cardHint: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      marginBottom: t.space.lg,
    },
    rankRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      paddingVertical: t.space.sm,
    },
    rankNum: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
      width: 20,
    },
    rankName: {
      flex: 1,
      fontSize: t.font.size.body,
      color: t.color.text,
    },
    rankCount: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
    },
    muted: {
      fontSize: t.font.size.bodySm,
      color: t.color.textSubtle,
      textAlign: 'center',
      paddingVertical: t.space.md,
    },
  })
