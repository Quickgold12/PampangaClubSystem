// ─────────────────────────────────────────────────────────────────────────────
// Faculty Console — Manage All Clubs (faculty coordinators only).
//
// What this screen does:
//   • Lists EVERY club in the school with member count, adviser, and an
//     activity status badge (Active / Inactive / Never).
//   • Search box filters by club or adviser name.
//   • Tapping a club opens its detail screen. (A faculty coordinator has full
//     officer-style powers on clubs they coordinate; on others they can view.)
//
// This is the cross-club management hub. Per-club editing still happens inside
// each club's screens — this is the single place to find any club fast.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { listAdvisers, updateClub } from '@/services/clubs.service'
import { getSchoolOverview } from '@/services/faculty.service'
import { ClubActivity } from '@/types'
import { toastSuccess } from '@/utils/toast'
import { router, Stack } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

const INACTIVE_DAYS = 30

export default function FacultyClubsScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { profile } = useAuth()
  const isFaculty = profile?.role === 'faculty_coordinator'

  const [clubs, setClubs] = useState<ClubActivity[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Assign-adviser modal state ─────────────────────────────────────────
  // `assigningClub` is the row whose adviser we're changing (modal open when
  // non-null). Advisers list is fetched lazily when the modal opens.
  const [assigningClub, setAssigningClub] = useState<ClubActivity | null>(null)
  const [advisers, setAdvisers] = useState<
    Array<{ id: string; full_name: string; email: string }>
  >([])
  const [adviserLoading, setAdviserLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const openAssignAdviser = async (club: ClubActivity) => {
    setAssigningClub(club)
    setAdviserLoading(true)
    const { data } = await listAdvisers()
    setAdvisers(data ?? [])
    setAdviserLoading(false)
  }

  const handleAssignAdviser = async (adviserId: string | null) => {
    if (!assigningClub) return
    setSaving(true)
    const { error } = await updateClub(assigningClub.id, { adviser_id: adviserId })
    setSaving(false)
    if (error) {
      Alert.alert('Could not assign adviser', error)
      return
    }
    setAssigningClub(null)
    toastSuccess('Adviser updated')
    await load()
  }

  const load = useCallback(async () => {
    if (!isFaculty) return
    const { data } = await getSchoolOverview()
    if (data) setClubs(data.clubs)
  }, [isFaculty])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clubs
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.adviserName ?? '').toLowerCase().includes(q)
    )
  }, [clubs, query])

  // Map days-since-activity → a colored status chip. Defined here so it has
  // access to the theme tokens.
  const statusOf = (days: number | null): { label: string; bg: string; fg: string } => {
    if (days === null) return { label: 'Never', bg: theme.color.dangerSubtle, fg: theme.color.danger }
    if (days > INACTIVE_DAYS) return { label: 'Inactive', bg: theme.color.dangerSubtle, fg: theme.color.danger }
    return { label: 'Active', bg: theme.color.successSubtle, fg: theme.color.success }
  }

  if (!isFaculty) {
    return (
      <>
        <Stack.Screen options={{ title: 'All Clubs', headerShown: true }} />
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
      <Stack.Screen options={{ title: 'All Clubs', headerShown: true }} />
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Faculty Console</Text>
            <Text style={styles.title}>All Clubs</Text>
            <TextInput
              style={styles.search}
              placeholder="Search clubs or advisers…"
              placeholderTextColor={theme.color.textSubtle}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {query.trim() ? `No clubs match "${query.trim()}".` : 'No clubs yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = statusOf(item.daysSinceActivity)
          return (
            <View style={styles.row}>
              {/* Main pressable opens the club detail. */}
              <Pressable
                onPress={() => router.push(`/club/${item.id}` as never)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.name}`}
              >
                <View style={styles.rowText}>
                  <Text style={styles.clubName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.clubMeta} numberOfLines={1}>
                    {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
                    {item.adviserName ? ` • ${item.adviserName}` : ' • no adviser'}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
                </View>
              </Pressable>
              {/* Inline action: change/assign the adviser without leaving this list. */}
              <Pressable
                onPress={() => openAssignAdviser(item)}
                style={({ pressed }) => [styles.adviserButton, pressed && styles.adviserButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={item.adviserName ? 'Change adviser' : 'Assign adviser'}
              >
                <Text style={styles.adviserButtonText}>
                  {item.adviserName ? 'Change Adviser' : 'Assign Adviser'}
                </Text>
              </Pressable>
            </View>
          )
        }}
      />

      {/* Assign-adviser modal. Lists all users with role='adviser'; tap a name
          to make them the club's adviser. A "None / Remove adviser" option
          clears the slot. */}
      <Modal
        visible={assigningClub !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAssigningClub(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAssigningClub(null)}>
          {/* Inner Pressable swallows the tap so tapping inside the sheet
              doesn't dismiss it. */}
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {assigningClub?.adviserName ? 'Change Adviser' : 'Assign Adviser'}
            </Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>
              {assigningClub?.name}
            </Text>

            {adviserLoading ? (
              <ActivityIndicator color={theme.color.brand} style={{ marginVertical: 24 }} />
            ) : advisers.length === 0 ? (
              <Text style={styles.modalEmpty}>
                No users with the adviser role exist yet.
              </Text>
            ) : (
              <FlatList
                data={advisers}
                keyExtractor={(a) => a.id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleAssignAdviser(item.id)}
                    disabled={saving}
                    style={({ pressed }) => [styles.modalRow, pressed && styles.rowPressed]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.modalRowName}>{item.full_name}</Text>
                    <Text style={styles.modalRowMeta}>{item.email}</Text>
                  </Pressable>
                )}
              />
            )}

            {/* Clear-adviser option (only meaningful if one is already set). */}
            {assigningClub?.adviserName && (
              <Pressable
                onPress={() => handleAssignAdviser(null)}
                disabled={saving}
                style={({ pressed }) => [styles.modalClear, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.modalClearText}>Remove adviser</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setAssigningClub(null)}
              style={styles.modalCancel}
              accessibilityRole="button"
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.color.background, padding: t.space.xl },
    listContent: { flexGrow: 1, padding: t.space.xl, backgroundColor: t.color.background },
    header: { marginBottom: t.space.lg },
    eyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.accent,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    title: { fontSize: t.font.size.h1, lineHeight: t.font.lineHeight.h1, fontWeight: t.font.weight.bold, color: t.color.text, marginBottom: t.space.md },
    search: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      fontSize: t.font.size.body,
      color: t.color.text,
      minHeight: t.touchTarget,
    },
    // Row is now a vertical stack: main pressable + bottom action button.
    row: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
      overflow: 'hidden',
    },
    rowMain: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: t.space.lg,
      gap: t.space.md,
    },
    rowPressed: { backgroundColor: t.color.surfaceMuted },
    rowText: { flex: 1 },
    clubName: { fontSize: t.font.size.body, fontWeight: t.font.weight.semibold, color: t.color.text },
    clubMeta: { fontSize: t.font.size.bodySm, color: t.color.textMuted, marginTop: 2 },
    statusBadge: { borderRadius: t.radius.pill, paddingHorizontal: t.space.md, paddingVertical: 4 },
    statusText: { fontSize: t.font.size.caption, fontWeight: t.font.weight.semibold, letterSpacing: t.font.tracking.caps, textTransform: 'uppercase' },
    // Inline adviser action — full-width strip below the main row.
    adviserButton: {
      paddingVertical: t.space.sm,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: t.color.border,
      backgroundColor: t.color.brandSubtle,
    },
    adviserButtonPressed: { backgroundColor: t.color.surfaceMuted },
    adviserButtonText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    // Assign-adviser modal.
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      padding: t.space.xl,
    },
    modalSheet: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      ...t.shadow.card,
    },
    modalTitle: {
      fontSize: t.font.size.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    modalSubtitle: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginTop: 2,
      marginBottom: t.space.md,
    },
    modalEmpty: { color: t.color.textMuted, fontSize: t.font.size.body, paddingVertical: t.space.lg, textAlign: 'center' },
    modalRow: {
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.sm,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    modalRowName: { fontSize: t.font.size.body, fontWeight: t.font.weight.semibold, color: t.color.text },
    modalRowMeta: { fontSize: t.font.size.caption, color: t.color.textMuted, marginTop: 2 },
    modalClear: {
      paddingVertical: t.space.md,
      marginTop: t.space.sm,
      alignItems: 'center',
      borderRadius: t.radius.md,
      backgroundColor: t.color.dangerSubtle,
    },
    modalClearText: { color: t.color.danger, fontSize: t.font.size.bodySm, fontWeight: t.font.weight.semibold },
    modalCancel: { paddingVertical: t.space.md, alignItems: 'center', marginTop: t.space.sm },
    modalCancelText: { color: t.color.textMuted, fontSize: t.font.size.bodySm, fontWeight: t.font.weight.semibold },
    empty: { paddingVertical: t.space['2xl'], alignItems: 'center' },
    emptyText: { color: t.color.textSubtle, fontSize: t.font.size.body, textAlign: 'center' },
  })
