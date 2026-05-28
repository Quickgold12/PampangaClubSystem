// ─────────────────────────────────────────────────────────────────────────────
// Collection Tracking screen — track who paid their dues.
//
// What this screen does:
//   • Lists dues periods (collection campaigns) for the club.
//   • Officers/advisers can create a new period (name + per-member amount) and
//     delete periods.
//   • Tapping a period expands a member checklist showing paid/unpaid, with a
//     "Paid X / N" progress count. Officers tap a member to toggle paid/unpaid.
//   • Members (non-officers) see the checklist read-only — useful for
//     transparency and for a student to confirm their own payment was logged.
//
// Paid state = presence of a dues_payments row (see dues.service.ts).
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { getClubDetail } from '@/services/clubs.service'
import {
  createPeriod,
  deletePeriod,
  getMemberStatuses,
  listPeriods,
  setPaid,
} from '@/services/dues.service'
import { ClubDetail, DuesMemberStatus, DuesPeriod } from '@/types'
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

export default function DuesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [periods, setPeriods] = useState<DuesPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Composer (new period) state.
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)

  // Expanded period + its cached member statuses, keyed by period id.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, DuesMemberStatus[]>>({})

  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, periodsRes] = await Promise.all([getClubDetail(id), listPeriods(id)])
    if (clubRes.data) setClub(clubRes.data)
    if (periodsRes.data) setPeriods(periodsRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    setStatuses({}) // invalidate cached checklists
    setExpandedId(null)
    await load()
    setRefreshing(false)
  }, [load])

  // Officer/adviser gate for create/delete/toggle.
  const canEdit =
    !!user &&
    !!club &&
    (user.id === club.adviser_id ||
      user.id === club.faculty_coordinator_id ||
      club.members.some((m) => m.id === user.id && m.role_in_club === 'officer'))

  const handleCreate = async () => {
    if (!id || !user) return
    const cleanName = sanitizeText(name)
    const parsed = parseFloat(amount.replace(/,/g, ''))
    if (!cleanName) {
      Alert.alert('Missing name', 'Name the collection, e.g. "1st Semester Dues".')
      return
    }
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert('Invalid amount', 'Enter the per-member amount, e.g. 150.')
      return
    }
    setCreating(true)
    const { error } = await createPeriod({ orgId: id, name: cleanName, amount: parsed, createdBy: user.id })
    setCreating(false)
    if (error) {
      Alert.alert('Could not create', error)
      return
    }
    setName('')
    setAmount('')
    await load()
  }

  const handleDeletePeriod = (periodId: string, label: string) => {
    Alert.alert('Delete collection?', `"${label}" and all its payment records will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setPeriods((prev) => prev.filter((p) => p.id !== periodId))
          const { error } = await deletePeriod(periodId)
          if (error) {
            Alert.alert('Delete failed', error)
            load()
          }
        },
      },
    ])
  }

  // Expand a period → lazily fetch its member checklist (once per session).
  const toggleExpand = async (period: DuesPeriod) => {
    if (expandedId === period.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(period.id)
    if (!statuses[period.id] && id) {
      const { data } = await getMemberStatuses(id, period.id)
      if (data) setStatuses((prev) => ({ ...prev, [period.id]: data }))
    }
  }

  // Toggle one member's paid status. Optimistic local flip, then persist.
  const handleTogglePaid = async (period: DuesPeriod, member: DuesMemberStatus) => {
    if (!id || !user || !canEdit) return
    const nextPaid = !member.paid

    setStatuses((prev) => ({
      ...prev,
      [period.id]: (prev[period.id] ?? []).map((m) =>
        m.user_id === member.user_id ? { ...m, paid: nextPaid } : m
      ),
    }))

    const { error } = await setPaid({
      orgId: id,
      periodId: period.id,
      userId: member.user_id,
      paid: nextPaid,
      recordedBy: user.id,
    })
    if (error) {
      Alert.alert('Could not update', error)
      // Revert the optimistic flip by refetching the checklist.
      const { data } = await getMemberStatuses(id, period.id)
      if (data) setStatuses((prev) => ({ ...prev, [period.id]: data }))
    }
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
      <Stack.Screen options={{ title: 'Collection Tracking', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Dues Collection</Text>
        </View>

        {/* Create-period composer (officers/advisers). */}
        {canEdit && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>New Collection</Text>
            <Input
              label="Name"
              placeholder="1st Semester 2026 Dues"
              value={name}
              onChangeText={setName}
              editable={!creating}
            />
            <Input
              label="Amount per member (₱)"
              placeholder="150"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!creating}
            />
            <Button label="Create Collection" onPress={handleCreate} loading={creating} />
          </View>
        )}

        {/* Period list. */}
        {periods.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {canEdit ? 'No collections yet. Create one above.' : 'No collections yet.'}
            </Text>
          </View>
        ) : (
          periods.map((p) => {
            const isOpen = expandedId === p.id
            const rows = statuses[p.id]
            const paidCount = rows?.filter((m) => m.paid).length ?? 0
            return (
              <View key={p.id} style={styles.periodCard}>
                <Pressable
                  onPress={() => toggleExpand(p)}
                  style={styles.periodHeader}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, expand member list`}
                >
                  <View style={styles.periodHeaderText}>
                    <Text style={styles.periodName}>{p.name}</Text>
                    <Text style={styles.periodMeta}>
                      {formatMoney(p.amount)} per member
                      {rows ? ` • ${paidCount}/${rows.length} paid` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{isOpen ? '▾' : '▸'}</Text>
                </Pressable>

                {isOpen && (
                  <View style={styles.checklist}>
                    {rows === undefined ? (
                      <ActivityIndicator color={theme.color.brand} />
                    ) : rows.length === 0 ? (
                      <Text style={styles.bodyMuted}>This club has no members yet.</Text>
                    ) : (
                      rows.map((m) => (
                        <Pressable
                          key={m.user_id}
                          onPress={() => handleTogglePaid(p, m)}
                          disabled={!canEdit}
                          style={({ pressed }) => [
                            styles.memberRow,
                            pressed && canEdit && styles.memberRowPressed,
                          ]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: m.paid, disabled: !canEdit }}
                        >
                          <View style={[styles.checkbox, m.paid && styles.checkboxOn]}>
                            {m.paid && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={styles.memberName}>{m.full_name}</Text>
                          <Text style={[styles.statusText, m.paid ? styles.paidText : styles.unpaidText]}>
                            {m.paid ? 'Paid' : 'Unpaid'}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}

                {/* Delete period — officers/advisers only. */}
                {canEdit && (
                  <Pressable
                    onPress={() => handleDeletePeriod(p.id, p.name)}
                    style={({ pressed }) => [styles.deleteChip, pressed && styles.deleteChipPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${p.name}`}
                  >
                    <Text style={styles.deleteChipText}>Delete Collection</Text>
                  </Pressable>
                )}
              </View>
            )
          })
        )}
      </ScrollView>
    </>
  )
}

const formatMoney = (value: number): string => {
  try {
    return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } catch {
    return `₱${value.toFixed(2)}`
  }
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
      color: t.color.accent,
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
    periodCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    periodHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    periodHeaderText: {
      flex: 1,
    },
    periodName: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    periodMeta: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginTop: 2,
    },
    chevron: {
      fontSize: t.font.size.lead,
      color: t.color.textSubtle,
      marginLeft: t.space.sm,
    },
    checklist: {
      marginTop: t.space.md,
      paddingTop: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.sm,
      gap: t.space.md,
    },
    memberRowPressed: {
      opacity: 0.6,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: t.radius.sm,
      borderWidth: 2,
      borderColor: t.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: {
      backgroundColor: t.color.success,
      borderColor: t.color.success,
    },
    checkmark: {
      color: t.color.textInverse,
      fontWeight: t.font.weight.bold,
      fontSize: 13,
    },
    memberName: {
      flex: 1,
      fontSize: t.font.size.body,
      color: t.color.text,
    },
    statusText: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    paidText: {
      color: t.color.success,
    },
    unpaidText: {
      color: t.color.textSubtle,
    },
    bodyMuted: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    deleteChip: {
      alignSelf: 'flex-start',
      marginTop: t.space.md,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.dangerSubtle,
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    deleteChipPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    deleteChipText: {
      fontSize: t.font.size.caption,
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
    },
    empty: {
      paddingVertical: t.space['2xl'],
      alignItems: 'center',
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
      textAlign: 'center',
    },
  })
