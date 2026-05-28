// ─────────────────────────────────────────────────────────────────────────────
// Finances screen — financial transparency per club.
//
// What this screen does:
//   • Top: balance card (₱ amount) + two smaller tiles (Income / Expense).
//     Balance turns red when negative so problems are visible at a glance.
//   • Composer (officers/advisers only): income/expense toggle, category,
//     amount, optional description, optional date. Adds the row via service.
//   • History: every transaction newest-first with type pill, amount, category,
//     date, who recorded it. Officers/advisers see a delete chip.
//
// Members see read-only — they can see the books but can't edit them.
// Amounts are formatted as Philippine Pesos (₱) since this is a PH school.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import { DateField } from '@/components/common/DateField'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { getClubDetail } from '@/services/clubs.service'
import {
  deleteRecord,
  exportFinancialPdf,
  getSummary,
  listRecords,
  recordTransaction,
} from '@/services/financial.service'
import { pickImage, uploadReceipt, type PickedImage } from '@/services/storage.service'
import {
  ClubDetail,
  FinancialRecordWithRecorder,
  FinancialSummary,
} from '@/types'
import { sanitizeText } from '@/utils/sanitize'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
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

type TxType = 'income' | 'expense'

// "today" in ISO date format (YYYY-MM-DD). Default for the date input so most
// entries just need amount + category.
const todayISO = () => new Date().toISOString().slice(0, 10)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export default function FinancesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [records, setRecords] = useState<FinancialRecordWithRecorder[]>([])
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Composer state.
  const [txType, setTxType] = useState<TxType>('income')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [recordDate, setRecordDate] = useState(todayISO())
  const [receipt, setReceipt] = useState<PickedImage | null>(null) // attached receipt photo (not yet uploaded)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false) // PDF export in progress

  const load = useCallback(async () => {
    if (!id) return
    // Three queries in parallel — club detail + record list + summary.
    const [clubRes, recordsRes, summaryRes] = await Promise.all([
      getClubDetail(id),
      listRecords(id),
      getSummary(id),
    ])
    if (clubRes.data) setClub(clubRes.data)
    if (recordsRes.data) setRecords(recordsRes.data)
    if (summaryRes.data) setSummary(summaryRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Posting a transaction needs officer/adviser/faculty role (same as before).
  const canEdit =
    !!user &&
    !!club &&
    (user.id === club.adviser_id ||
      user.id === club.faculty_coordinator_id ||
      club.members.some((m) => m.id === user.id && m.role_in_club === 'officer'))

  // Adviser/faculty override for the delete-chip visibility. Mirrors the
  // new RLS: only the recorder OR an adviser can delete a record. An
  // officer-vs-officer delete is blocked at the DB layer, so we hide the
  // chip in that case too instead of letting the user hit a permission error.
  const isAdviser =
    !!user &&
    !!club &&
    (user.id === club.adviser_id || user.id === club.faculty_coordinator_id)

  const handleSave = async () => {
    if (!id || !user) return
    const cleanCategory = sanitizeText(category)
    const cleanDescription = sanitizeText(description)
    const parsedAmount = parseFloat(amount.replace(/,/g, '')) // tolerate "1,000.50"

    if (!cleanCategory) {
      Alert.alert('Missing category', 'What is this for? e.g. "Membership Dues" or "Venue".')
      return
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number, e.g. 250 or 1500.50.')
      return
    }
    if (!DATE_REGEX.test(recordDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD, e.g. 2026-05-18.')
      return
    }

    setSaving(true)

    // If a receipt photo is attached, upload it first and capture its URL.
    // A failed receipt upload aborts the save so we don't record a transaction
    // that's missing the receipt the user expected to attach.
    let receiptUrl: string | null = null
    if (receipt) {
      const uploaded = await uploadReceipt(id, receipt)
      if (uploaded.error || !uploaded.data) {
        setSaving(false)
        Alert.alert('Receipt upload failed', uploaded.error ?? 'Please try again.')
        return
      }
      receiptUrl = uploaded.data.publicUrl
    }

    const { error } = await recordTransaction({
      orgId: id,
      type: txType,
      category: cleanCategory,
      amount: parsedAmount,
      description: cleanDescription || undefined,
      recordDate,
      recordedBy: user.id,
      receiptUrl,
    })
    setSaving(false)

    if (error) {
      Alert.alert('Could not save', error)
      return
    }
    // Clear the form (keep type + date for repeat entries) and reload.
    setCategory('')
    setAmount('')
    setDescription('')
    setReceipt(null)
    await load()
  }

  // Pick a receipt photo for the composer (not uploaded until Save).
  const handleAttachReceipt = async () => {
    const picked = await pickImage([3, 4]) // portrait-ish, typical receipt shape
    if (picked.error) {
      Alert.alert('Could not open library', picked.error)
      return
    }
    if (picked.data) setReceipt(picked.data)
  }

  // Generate + share a PDF of the current records and summary.
  const handleExportPdf = async () => {
    if (!club || !summary) return
    setExporting(true)
    const { error } = await exportFinancialPdf(club.name, records, summary)
    setExporting(false)
    if (error) Alert.alert('Export failed', error)
  }

  const handleDelete = (recordId: string, label: string) => {
    Alert.alert('Delete transaction?', `"${label}" will be removed from the books.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic remove + resync from server on failure.
          setRecords((prev) => prev.filter((r) => r.id !== recordId))
          const { error } = await deleteRecord(recordId)
          if (error) {
            Alert.alert('Delete failed', error)
            load()
          } else {
            // Summary needs to be re-fetched so the balance updates.
            const { data } = await getSummary(id!)
            if (data) setSummary(data)
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

  const balance = summary?.balance ?? 0
  const isNegative = balance < 0

  return (
    <>
      <Stack.Screen options={{ title: 'Finances', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Finances</Text>
        </View>

        {/* Sub-feature navigation — Collection Tracking + Budget are separate
            screens; Export PDF generates a report of the data below. All
            visible to anyone who can view finances (transparency). */}
        <View style={styles.navRow}>
          <NavTile label="Collection Tracking" onPress={() => router.push(`/club/${id}/dues` as never)} />
          <NavTile label="Budget Planning" onPress={() => router.push(`/club/${id}/budget` as never)} />
        </View>
        <Pressable
          onPress={handleExportPdf}
          disabled={exporting}
          style={({ pressed }) => [styles.exportButton, pressed && styles.exportButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Export financial report to PDF"
        >
          {exporting ? (
            <ActivityIndicator color={theme.color.brandPressed} size="small" />
          ) : (
            <Text style={styles.exportButtonText}>⬇  Export Report (PDF)</Text>
          )}
        </Pressable>

        {/* Hero balance card — currency in the brand color, red when negative. */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={[styles.balanceValue, isNegative && styles.balanceNegative]}>
            {formatMoney(balance)}
          </Text>
          <View style={styles.balanceSubrow}>
            <View style={styles.balanceSub}>
              <Text style={styles.balanceSubLabel}>Income</Text>
              <Text style={[styles.balanceSubValue, styles.incomeText]}>
                {formatMoney(summary?.totalIncome ?? 0)}
              </Text>
            </View>
            <View style={styles.balanceSub}>
              <Text style={styles.balanceSubLabel}>Expense</Text>
              <Text style={[styles.balanceSubValue, styles.expenseText]}>
                {formatMoney(summary?.totalExpense ?? 0)}
              </Text>
            </View>
            <View style={styles.balanceSub}>
              <Text style={styles.balanceSubLabel}>Records</Text>
              <Text style={styles.balanceSubValue}>{summary?.transactionCount ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* Composer — officers/advisers only. */}
        {canEdit && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Record Transaction</Text>

            {/* Income/Expense toggle: visual cue uses success/danger colors. */}
            <View style={styles.typeToggle}>
              <TypeButton
                label="Income"
                active={txType === 'income'}
                color={theme.color.success}
                onPress={() => setTxType('income')}
              />
              <TypeButton
                label="Expense"
                active={txType === 'expense'}
                color={theme.color.danger}
                onPress={() => setTxType('expense')}
              />
            </View>

            <Input
              label="Category"
              placeholder={txType === 'income' ? 'Membership Dues' : 'Supplies'}
              value={category}
              onChangeText={setCategory}
              autoCapitalize="words"
              editable={!saving}
            />
            <Input
              label="Amount (₱)"
              placeholder="250.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            <Input
              label="Description (optional)"
              placeholder="Notes, receipt #, etc."
              value={description}
              onChangeText={setDescription}
              editable={!saving}
            />
            <DateField label="Date" value={recordDate} onChange={setRecordDate} editable={!saving} />

            {/* Optional receipt photo. Shows a preview thumbnail once attached,
                with a Remove option. Upload happens on Save. */}
            <Text style={styles.receiptLabel}>Receipt (optional)</Text>
            {receipt ? (
              <View style={styles.receiptPreviewRow}>
                <Image
                  source={{ uri: `data:${receipt.mimeType};base64,${receipt.base64}` }}
                  style={styles.receiptPreview}
                  contentFit="cover"
                />
                <Pressable onPress={() => setReceipt(null)} hitSlop={8} disabled={saving}>
                  <Text style={styles.receiptRemove}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleAttachReceipt}
                disabled={saving}
                style={({ pressed }) => [styles.attachButton, pressed && styles.attachButtonPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.attachButtonText}>📎  Attach Receipt Photo</Text>
              </Pressable>
            )}

            <Button label="Save Transaction" onPress={handleSave} loading={saving} style={styles.saveButton} />
          </View>
        )}

        {/* History list. */}
        <Text style={styles.sectionLabel}>History</Text>
        {records.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {canEdit
                ? 'No transactions recorded yet. Add one above.'
                : 'No transactions recorded yet.'}
            </Text>
          </View>
        ) : (
          records.map((r) => (
            <View key={r.id} style={styles.txCard}>
              <View style={styles.txTop}>
                <View
                  style={[
                    styles.txPill,
                    r.type === 'income' ? styles.txPillIncome : styles.txPillExpense,
                  ]}
                >
                  <Text
                    style={[
                      styles.txPillText,
                      r.type === 'income' ? styles.incomeText : styles.expenseText,
                    ]}
                  >
                    {r.type === 'income' ? 'Income' : 'Expense'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    r.type === 'income' ? styles.incomeText : styles.expenseText,
                  ]}
                >
                  {r.type === 'income' ? '+' : '−'} {formatMoney(r.amount)}
                </Text>
              </View>
              <Text style={styles.txCategory}>{r.category}</Text>
              {r.description ? (
                <Text style={styles.txDescription}>{r.description}</Text>
              ) : null}
              {/* Receipt thumbnail — tap to open the full image in the browser/
                  viewer. Only rendered when a receipt was attached. */}
              {r.receipt_url ? (
                <Pressable
                  onPress={() => router.push(r.receipt_url as never)}
                  style={styles.receiptThumbWrap}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="View receipt"
                >
                  <Image
                    source={{ uri: r.receipt_url }}
                    style={styles.receiptThumb}
                    contentFit="cover"
                    transition={150}
                  />
                  <Text style={styles.receiptThumbHint}>Receipt — tap to view</Text>
                </Pressable>
              ) : null}
              <View style={styles.txFooter}>
                <Text style={styles.txMeta}>
                  {formatDate(r.record_date)}
                  {r.recorder?.full_name ? ` • by ${r.recorder.full_name}` : ''}
                </Text>
                {/* Delete chip: only the original recorder or an adviser
                    sees it. Matches RLS so users never get a permission
                    error from tapping a button they shouldn't see. */}
                {(r.recorded_by === user?.id || isAdviser) && (
                  <Pressable
                    onPress={() => handleDelete(r.id, `${r.category} ${formatMoney(r.amount)}`)}
                    style={({ pressed }) => [
                      styles.deleteChip,
                      pressed && styles.deleteChipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Delete transaction"
                  >
                    <Text style={styles.deleteChipText}>Delete</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  )
}

// Half-width navigation tile for the sub-feature row (Dues / Budget).
function NavTile({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navTile, pressed && styles.navTilePressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.navTileText}>{label}</Text>
    </Pressable>
  )
}

// Income/Expense pill toggle. The active state borrows the semantic colour
// (success/danger) so the choice reads at a glance.
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
      style={[
        styles.typeButton,
        active && { backgroundColor: color, borderColor: color },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.typeButtonText,
          active && { color: theme.color.textInverse },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// PH peso formatter — symbol + thousands grouping + always 2 decimals.
// Using Intl ensures locale-correct grouping; falling back to a simple format
// if Intl isn't available (rare on RN but safe).
const formatMoney = (value: number): string => {
  const abs = Math.abs(value)
  try {
    const formatted = new Intl.NumberFormat('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)
    return `${value < 0 ? '−' : ''}₱${formatted}`
  } catch {
    return `${value < 0 ? '−' : ''}₱${abs.toFixed(2)}`
  }
}

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
    // Sub-feature nav row (Collection Tracking / Budget).
    navRow: {
      flexDirection: 'row',
      gap: t.space.sm,
      marginBottom: t.space.sm,
    },
    navTile: {
      flex: 1,
      backgroundColor: t.color.brandSubtle,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.md,
      borderWidth: 1,
      borderColor: t.color.brand,
      alignItems: 'center',
    },
    navTilePressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    navTileText: {
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
      textAlign: 'center',
    },
    // Export PDF button — full-width, outline style.
    exportButton: {
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
    exportButtonPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    exportButtonText: {
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
    },
    // Hero balance card.
    balanceCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    balanceLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    balanceValue: {
      fontSize: t.font.size.h1,
      lineHeight: t.font.lineHeight.h1,
      fontWeight: t.font.weight.bold,
      color: t.color.accent,
      marginBottom: t.space.md,
    },
    balanceNegative: {
      color: t.color.danger,
    },
    balanceSubrow: {
      flexDirection: 'row',
      gap: t.space.md,
      paddingTop: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    balanceSub: {
      flex: 1,
    },
    balanceSubLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    balanceSubValue: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
    },
    incomeText: {
      color: t.color.success,
    },
    expenseText: {
      color: t.color.danger,
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
    // Receipt attach controls in the composer.
    receiptLabel: {
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    attachButton: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderStyle: 'dashed',
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
      marginBottom: t.space.md,
    },
    attachButtonPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    attachButtonText: {
      color: t.color.textMuted,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.medium,
    },
    receiptPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      marginBottom: t.space.md,
    },
    receiptPreview: {
      width: 56,
      height: 72,
      borderRadius: t.radius.sm,
      backgroundColor: t.color.surfaceMuted,
    },
    receiptRemove: {
      color: t.color.danger,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    saveButton: {
      marginTop: t.space.xs,
    },
    // Receipt thumbnail shown on a transaction history card.
    receiptThumbWrap: {
      marginTop: t.space.sm,
    },
    receiptThumb: {
      width: '100%',
      height: 140,
      borderRadius: t.radius.md,
      backgroundColor: t.color.surfaceMuted,
    },
    receiptThumbHint: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      marginTop: t.space.xs,
    },
    sectionLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    // Transaction history row.
    txCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    txTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.space.sm,
    },
    txPill: {
      paddingHorizontal: t.space.md,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
    },
    txPillIncome: {
      backgroundColor: t.color.successSubtle,
    },
    txPillExpense: {
      backgroundColor: t.color.dangerSubtle,
    },
    txPillText: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    txAmount: {
      fontSize: t.font.size.lead,
      fontWeight: t.font.weight.bold,
    },
    txCategory: {
      fontSize: t.font.size.body,
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
    },
    txDescription: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginTop: 2,
    },
    txFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: t.space.sm,
      paddingTop: t.space.sm,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    txMeta: {
      flex: 1,
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
    deleteChip: {
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
