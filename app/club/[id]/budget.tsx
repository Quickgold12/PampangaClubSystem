// ─────────────────────────────────────────────────────────────────────────────
// Budget Planning screen — planned income/expense per semester.
//
// What this screen does:
//   • Groups budget line items by period label ("1st Semester 2026") and shows,
//     per period: planned income, planned expense, and net.
//   • Officers/advisers can add a line item (period + type + category + amount)
//     and delete items.
//   • Members see it read-only.
//
// This is the PLAN. Actual money is in the Finances screen — comparing planned
// vs actual is a future enhancement; for now this is forward-looking budgeting.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import {
  createItem,
  deleteItem,
  listItems,
  summarise,
  type BudgetPeriodSummary,
} from '@/services/budget.service'
import { getClubDetail } from '@/services/clubs.service'
import { BudgetItem, ClubDetail } from '@/types'
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

type ItemType = 'income' | 'expense'

export default function BudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [items, setItems] = useState<BudgetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Composer state.
  const [periodLabel, setPeriodLabel] = useState('')
  const [itemType, setItemType] = useState<ItemType>('income')
  const [category, setCategory] = useState('')
  const [plannedAmount, setPlannedAmount] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, itemsRes] = await Promise.all([getClubDetail(id), listItems(id)])
    if (clubRes.data) setClub(clubRes.data)
    if (itemsRes.data) setItems(itemsRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Group items into per-period summaries (pure transform).
  const periods: BudgetPeriodSummary[] = useMemo(() => summarise(items), [items])

  const canEdit =
    !!user &&
    !!club &&
    (user.id === club.adviser_id ||
      user.id === club.faculty_coordinator_id ||
      club.members.some((m) => m.id === user.id && m.role_in_club === 'officer'))

  const handleCreate = async () => {
    if (!id || !user) return
    const cleanPeriod = sanitizeText(periodLabel)
    const cleanCategory = sanitizeText(category)
    const parsed = parseFloat(plannedAmount.replace(/,/g, ''))
    if (!cleanPeriod) {
      Alert.alert('Missing period', 'Name the period, e.g. "1st Semester 2026".')
      return
    }
    if (!cleanCategory) {
      Alert.alert('Missing category', 'What is this line for? e.g. "Dues" or "Events".')
      return
    }
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert('Invalid amount', 'Enter the planned amount, e.g. 5000.')
      return
    }
    setCreating(true)
    const { error } = await createItem({
      orgId: id,
      periodLabel: cleanPeriod,
      type: itemType,
      category: cleanCategory,
      plannedAmount: parsed,
      createdBy: user.id,
    })
    setCreating(false)
    if (error) {
      Alert.alert('Could not add', error)
      return
    }
    // Keep period + type for fast multi-line entry; clear category + amount.
    setCategory('')
    setPlannedAmount('')
    await load()
  }

  const handleDeleteItem = (itemId: string, label: string) => {
    Alert.alert('Delete line item?', `"${label}" will be removed from the budget.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((i) => i.id !== itemId))
          const { error } = await deleteItem(itemId)
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
      <Stack.Screen options={{ title: 'Budget Planning', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Budget Planning</Text>
        </View>

        {/* Add line item (officers/advisers). */}
        {canEdit && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Add Budget Line</Text>
            <Input
              label="Period"
              placeholder="1st Semester 2026"
              value={periodLabel}
              onChangeText={setPeriodLabel}
              editable={!creating}
            />
            <View style={styles.typeToggle}>
              <TypeButton
                label="Income"
                active={itemType === 'income'}
                color={theme.color.success}
                onPress={() => setItemType('income')}
              />
              <TypeButton
                label="Expense"
                active={itemType === 'expense'}
                color={theme.color.danger}
                onPress={() => setItemType('expense')}
              />
            </View>
            <Input
              label="Category"
              placeholder={itemType === 'income' ? 'Membership Dues' : 'Events'}
              value={category}
              onChangeText={setCategory}
              autoCapitalize="words"
              editable={!creating}
            />
            <Input
              label="Planned Amount (₱)"
              placeholder="5000"
              value={plannedAmount}
              onChangeText={setPlannedAmount}
              keyboardType="decimal-pad"
              editable={!creating}
            />
            <Button label="Add to Budget" onPress={handleCreate} loading={creating} />
          </View>
        )}

        {/* Per-period breakdown. */}
        {periods.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {canEdit ? 'No budget yet. Add a line above.' : 'No budget planned yet.'}
            </Text>
          </View>
        ) : (
          periods.map((period) => (
            <View key={period.period_label} style={styles.periodCard}>
              <Text style={styles.periodTitle}>{period.period_label}</Text>

              {/* Period totals. */}
              <View style={styles.totalsRow}>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Income</Text>
                  <Text style={[styles.totalValue, styles.incomeText]}>
                    {formatMoney(period.plannedIncome)}
                  </Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Expense</Text>
                  <Text style={[styles.totalValue, styles.expenseText]}>
                    {formatMoney(period.plannedExpense)}
                  </Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Net</Text>
                  <Text style={[styles.totalValue, period.net < 0 && styles.expenseText]}>
                    {formatMoney(period.net)}
                  </Text>
                </View>
              </View>

              {/* Line items. */}
              {period.items.map((item) => (
                <View key={item.id} style={styles.lineRow}>
                  <View
                    style={[
                      styles.dot,
                      item.type === 'income' ? styles.dotIncome : styles.dotExpense,
                    ]}
                  />
                  <Text style={styles.lineCategory}>{item.category}</Text>
                  <Text
                    style={[
                      styles.lineAmount,
                      item.type === 'income' ? styles.incomeText : styles.expenseText,
                    ]}
                  >
                    {item.type === 'income' ? '+' : '−'} {formatMoney(item.planned_amount)}
                  </Text>
                  {canEdit && (
                    <Pressable
                      onPress={() => handleDeleteItem(item.id, `${item.category} ${formatMoney(item.planned_amount)}`)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.category}`}
                    >
                      <Text style={styles.lineDelete}>✕</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </>
  )
}

// Income/Expense toggle — same pattern as the finances composer.
function TypeButton({
  label,
  active,
  color,
  onPress,
}: {
  label: string
  active: boolean
  color: string
  onPress: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      style={[styles.typeButton, active && { backgroundColor: color, borderColor: color }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.typeButtonText, active && { color: theme.color.textInverse }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const formatMoney = (value: number): string => {
  const abs = Math.abs(value)
  try {
    return `${value < 0 ? '−' : ''}₱${abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } catch {
    return `${value < 0 ? '−' : ''}₱${abs.toFixed(2)}`
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
    typeToggle: {
      flexDirection: 'row',
      gap: t.space.sm,
      marginBottom: t.space.md,
    },
    typeButton: {
      flex: 1,
      paddingVertical: t.space.sm,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.surface,
      alignItems: 'center',
    },
    typeButtonText: {
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.textMuted,
    },
    periodCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    periodTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.md,
    },
    totalsRow: {
      flexDirection: 'row',
      gap: t.space.sm,
      marginBottom: t.space.md,
      paddingBottom: t.space.md,
      borderBottomWidth: 1,
      borderBottomColor: t.color.border,
    },
    totalBox: {
      flex: 1,
    },
    totalLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    totalValue: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    incomeText: {
      color: t.color.success,
    },
    expenseText: {
      color: t.color.danger,
    },
    lineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.sm,
      gap: t.space.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dotIncome: {
      backgroundColor: t.color.success,
    },
    dotExpense: {
      backgroundColor: t.color.danger,
    },
    lineCategory: {
      flex: 1,
      fontSize: t.font.size.body,
      color: t.color.text,
    },
    lineAmount: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
    },
    lineDelete: {
      fontSize: t.font.size.body,
      color: t.color.textSubtle,
      paddingHorizontal: t.space.xs,
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
