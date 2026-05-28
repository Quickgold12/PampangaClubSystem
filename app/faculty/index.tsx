// ─────────────────────────────────────────────────────────────────────────────
// Faculty Console — School Overview (faculty coordinators only).
//
// What this screen does:
//   • School-wide stat tiles: clubs, students, events, announcements.
//   • "Generate School Report (PDF)" — exports a club summary via expo-print.
//   • Inactive Clubs monitor: clubs with no activity in the last 30 days (or
//     ever), so the coordinator can follow up.
//   • "Manage All Clubs" button → the full club list screen.
//
// Access: gated to the faculty_coordinator app-wide role. Data also relies on
// the school-wide RLS from schema_v14.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { generateSchoolReportPdf, getSchoolOverview } from '@/services/faculty.service'
import { SchoolOverview } from '@/types'
import { router, Stack } from 'expo-router'
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

// Clubs with no activity in more than this many days (or never) are "inactive".
const INACTIVE_DAYS = 30

export default function FacultyOverviewScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { profile } = useAuth()

  const [overview, setOverview] = useState<SchoolOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const isFaculty = profile?.role === 'faculty_coordinator'

  const load = useCallback(async () => {
    if (!isFaculty) return
    const { data } = await getSchoolOverview()
    if (data) setOverview(data)
  }, [isFaculty])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const handleExport = async () => {
    if (!overview) return
    setExporting(true)
    const { error } = await generateSchoolReportPdf(overview, INACTIVE_DAYS)
    setExporting(false)
    if (error) Alert.alert('Export failed', error)
  }

  // Inactive = no activity in > INACTIVE_DAYS days, or never. Sorted most-stale
  // first (never-active clubs first, then longest since activity).
  const inactiveClubs = useMemo(() => {
    if (!overview) return []
    return overview.clubs
      .filter((c) => c.daysSinceActivity === null || c.daysSinceActivity > INACTIVE_DAYS)
      .sort((a, b) => (b.daysSinceActivity ?? Infinity) - (a.daysSinceActivity ?? Infinity))
  }, [overview])

  // Guard: non-faculty shouldn't reach this, but protect anyway.
  if (!isFaculty) {
    return (
      <>
        <Stack.Screen options={{ title: 'School Overview', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This area is for faculty coordinators only.</Text>
        </View>
      </>
    )
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
      <Stack.Screen options={{ title: 'School Overview', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Faculty Console</Text>
          <Text style={styles.title}>School Overview</Text>
        </View>

        {/* Stat tiles — 2×2 grid. */}
        <View style={styles.statGrid}>
          <StatTile value={overview?.stats.clubCount ?? 0} label="Clubs" />
          <StatTile value={overview?.stats.distinctMembers ?? 0} label="Students" />
          <StatTile value={overview?.stats.totalEvents ?? 0} label="Events" />
          <StatTile value={overview?.stats.totalAnnouncements ?? 0} label="Posts" />
        </View>

        {/* Actions. */}
        <Pressable
          onPress={() => router.push('/faculty/clubs' as never)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Manage All Clubs</Text>
        </Pressable>
        <Pressable
          onPress={handleExport}
          disabled={exporting}
          style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
          accessibilityRole="button"
        >
          {exporting ? (
            <ActivityIndicator color={theme.color.brandPressed} size="small" />
          ) : (
            <Text style={styles.outlineButtonText}>⬇  Generate School Report (PDF)</Text>
          )}
        </Pressable>

        {/* Inactive clubs monitor. */}
        <Text style={styles.sectionLabel}>
          Inactive Clubs · no activity in {INACTIVE_DAYS}+ days
        </Text>
        {inactiveClubs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Every club has been active recently. 🎉</Text>
          </View>
        ) : (
          inactiveClubs.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/club/${c.id}` as never)}
              style={({ pressed }) => [styles.clubRow, pressed && styles.clubRowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${c.name}`}
            >
              <View style={styles.clubRowText}>
                <Text style={styles.clubName}>{c.name}</Text>
                <Text style={styles.clubMeta}>
                  {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                  {c.adviserName ? ` • ${c.adviserName}` : ' • no adviser'}
                </Text>
              </View>
              <View style={styles.staleBadge}>
                <Text style={styles.staleBadgeText}>
                  {c.daysSinceActivity === null ? 'Never' : `${c.daysSinceActivity}d`}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  )
}

function StatTile({ value, label }: { value: number; label: string }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.color.background, padding: t.space.xl },
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
    // 2×2 stat grid.
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginBottom: t.space.lg },
    statTile: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    statValue: { fontSize: t.font.size.h1, lineHeight: t.font.lineHeight.h1, fontWeight: t.font.weight.bold, color: t.color.accent },
    statLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginTop: t.space.xs,
    },
    primaryButton: {
      backgroundColor: t.color.brand,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
      marginBottom: t.space.sm,
    },
    primaryButtonPressed: { backgroundColor: t.color.brandPressed },
    primaryButtonText: { color: t.color.onBrand, fontSize: t.font.size.body, fontWeight: t.font.weight.semibold },
    outlineButton: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
      marginBottom: t.space.lg,
      backgroundColor: t.color.surface,
      minHeight: t.touchTarget,
      justifyContent: 'center',
    },
    outlineButtonPressed: { backgroundColor: t.color.surfaceMuted },
    outlineButtonText: { color: t.color.brandPressed, fontSize: t.font.size.bodySm, fontWeight: t.font.weight.semibold },
    sectionLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    clubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
      gap: t.space.md,
    },
    clubRowPressed: { backgroundColor: t.color.surfaceMuted },
    clubRowText: { flex: 1 },
    clubName: { fontSize: t.font.size.body, fontWeight: t.font.weight.semibold, color: t.color.text },
    clubMeta: { fontSize: t.font.size.bodySm, color: t.color.textMuted, marginTop: 2 },
    staleBadge: {
      backgroundColor: t.color.dangerSubtle,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.md,
      paddingVertical: 4,
    },
    staleBadgeText: { fontSize: t.font.size.caption, color: t.color.danger, fontWeight: t.font.weight.bold },
    empty: { paddingVertical: t.space.xl, alignItems: 'center' },
    emptyText: { color: t.color.textSubtle, fontSize: t.font.size.body, textAlign: 'center' },
  })
