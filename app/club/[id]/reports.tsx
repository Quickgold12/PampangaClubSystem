// ─────────────────────────────────────────────────────────────────────────────
// Reports screen — formal report submission + adviser approval.
//
// What this screen does:
//   • Lists every report for the club (newest first) with status pills.
//   • Composer (officers/advisers/faculty only):
//       - Type toggle: Activity / Financial
//       - Title + content
//       - Submit → goes in as 'pending'
//   • Each report card shows status pill (Pending/Approved/Rejected), title,
//     body, submitter, date, and any reviewer comment after review.
//   • Adviser/faculty see Approve + Reject chips on pending reports. Reject
//     prompts for an optional comment (the reason).
//   • Delete chip: only visible to submitter or adviser/faculty (matches RLS).
//
// Regular student members can READ everything (audit trail) but cannot submit.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { getClubDetail } from '@/services/clubs.service'
import {
  approveReport,
  deleteReport,
  listForClub,
  rejectReport,
  submitReport,
  updateReport,
} from '@/services/report.service'
import {
  ClubDetail,
  ReportStatus,
  ReportType,
  ReportWithPeople,
} from '@/types'
import { sanitizeText } from '@/utils/sanitize'
import { toastSuccess } from '@/utils/toast'
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

export default function ReportsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [reports, setReports] = useState<ReportWithPeople[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Composer state — reused for both new submissions and edit-mode.
  const [type, setType] = useState<ReportType>('activity')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, reportsRes] = await Promise.all([getClubDetail(id), listForClub(id)])
    if (clubRes.data) setClub(clubRes.data)
    if (reportsRes.data) setReports(reportsRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Role gates for this specific club.
  //   canSubmit   → officer/adviser/faculty: can submit a new report
  //   isAdviser   → adviser/faculty only: can approve/reject pending reports
  // Student officers can submit but NOT moderate (matches the announcement
  // moderation pattern).
  const isAdviser =
    !!user &&
    !!club &&
    (user.id === club.adviser_id || user.id === club.faculty_coordinator_id)
  const isOfficer =
    !!user && !!club && club.members.some((m) => m.id === user.id && m.role_in_club === 'officer')
  const canSubmit = isAdviser || isOfficer

  const resetComposer = () => {
    setTitle('')
    setContent('')
    setType('activity')
    setEditingId(null)
  }

  // Switch the composer into edit mode for a specific report (submitter only).
  const handleEdit = (report: ReportWithPeople) => {
    setEditingId(report.id)
    setType(report.type)
    setTitle(report.title)
    setContent(report.content)
  }

  const handleSubmit = async () => {
    if (!id || !user) return
    const cleanTitle = sanitizeText(title)
    const cleanContent = sanitizeText(content)
    if (!cleanTitle) {
      Alert.alert('Missing title', 'Give the report a short title.')
      return
    }
    if (!cleanContent) {
      Alert.alert('Missing content', 'Write the body of the report.')
      return
    }

    setSubmitting(true)
    // Two paths: edit existing OR create new.
    if (editingId) {
      const { error } = await updateReport(editingId, {
        type,
        title: cleanTitle,
        content: cleanContent,
      })
      setSubmitting(false)
      if (error) {
        Alert.alert('Could not save', error)
        return
      }
      resetComposer()
      await load()
      toastSuccess('Report updated')
      return
    }

    const { error } = await submitReport({
      orgId: id,
      type,
      title: cleanTitle,
      content: cleanContent,
      submittedBy: user.id,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Could not submit', error)
      return
    }
    resetComposer()
    await load()
    toastSuccess('Report submitted', 'Pending adviser review.')
  }

  const handleApprove = (reportId: string) => {
    if (!user) return
    Alert.alert('Approve report?', 'The submitter will be notified it was approved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          // Optimistic local update.
          setReports((prev) =>
            prev.map((r) =>
              r.id === reportId
                ? { ...r, status: 'approved' as ReportStatus, reviewed_at: new Date().toISOString() }
                : r
            )
          )
          const { error } = await approveReport(reportId, user.id)
          if (error) {
            Alert.alert('Approve failed', error)
            load()
          }
        },
      },
    ])
  }

  const handleReject = (reportId: string) => {
    if (!user) return
    // Native Alert.prompt is iOS-only, so we use a confirm dialog and let the
    // adviser optionally add the reason in a follow-up step. To keep this
    // cross-platform AND lightweight, we just confirm + reject; reviewers
    // can add detailed feedback verbally / in a follow-up announcement.
    Alert.alert(
      'Reject report?',
      'The submitter will see the report was rejected and may edit + resubmit.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setReports((prev) =>
              prev.map((r) =>
                r.id === reportId
                  ? { ...r, status: 'rejected' as ReportStatus, reviewed_at: new Date().toISOString() }
                  : r
              )
            )
            const { error } = await rejectReport(reportId, user.id)
            if (error) {
              Alert.alert('Reject failed', error)
              load()
            }
          },
        },
      ]
    )
  }

  const handleDelete = (reportId: string, label: string) => {
    Alert.alert('Delete report?', `"${label}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setReports((prev) => prev.filter((r) => r.id !== reportId))
          const { error } = await deleteReport(reportId)
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
      <Stack.Screen options={{ title: 'Reports', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Reports</Text>
        </View>

        {/* Composer — officer/adviser/faculty submit a new report; submitter
            can also edit their own (label/button change in edit mode). */}
        {(canSubmit || editingId) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{editingId ? 'Edit Report' : 'Submit Report'}</Text>

            {/* Type toggle: activity vs financial. */}
            <View style={styles.typeToggle}>
              <TypeButton
                label="Activity"
                active={type === 'activity'}
                onPress={() => setType('activity')}
              />
              <TypeButton
                label="Financial"
                active={type === 'financial'}
                onPress={() => setType('financial')}
              />
            </View>

            <Input
              label="Title"
              placeholder={
                type === 'activity'
                  ? 'Q2 Activity Summary'
                  : 'Q2 Financial Report'
              }
              value={title}
              onChangeText={setTitle}
              editable={!submitting}
            />
            <Input
              label="Content"
              placeholder="Full report content…"
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={6}
              editable={!submitting}
              style={styles.contentInput}
            />
            <Button
              label={editingId ? 'Save Changes' : 'Submit for Approval'}
              onPress={handleSubmit}
              loading={submitting}
            />
            {/* Cancel link — only when editing an existing report. */}
            {editingId && (
              <Pressable
                onPress={resetComposer}
                style={styles.cancelEdit}
                hitSlop={8}
                disabled={submitting}
                accessibilityRole="button"
              >
                <Text style={styles.cancelEditText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* List. */}
        {reports.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {canSubmit
                ? 'No reports yet — submit one above.'
                : 'No reports yet.'}
            </Text>
          </View>
        ) : (
          reports.map((r) => {
            const isSubmitter = r.submitted_by === user?.id
            const canDelete = isSubmitter || isAdviser
            const canModerate = isAdviser && r.status === 'pending'
            return (
              <View key={r.id} style={styles.reportCard}>
                <View style={styles.reportTop}>
                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>
                      {r.type === 'activity' ? 'Activity' : 'Financial'}
                    </Text>
                  </View>
                  <StatusBadge status={r.status} />
                </View>

                <Text style={styles.reportTitle}>{r.title}</Text>
                <Text style={styles.reportContent}>{r.content}</Text>

                {/* Reviewer comment block — only after a decision. */}
                {r.reviewed_at && r.review_comment ? (
                  <View style={styles.reviewBlock}>
                    <Text style={styles.reviewBlockLabel}>Reviewer note</Text>
                    <Text style={styles.reviewBlockText}>{r.review_comment}</Text>
                  </View>
                ) : null}

                <View style={styles.reportFooter}>
                  <Text style={styles.reportMeta}>
                    {r.submitter?.full_name ?? 'Unknown'} • {formatDate(r.submitted_at)}
                    {r.reviewer?.full_name ? ` • by ${r.reviewer.full_name}` : ''}
                  </Text>
                  <View style={styles.actionRow}>
                    {canModerate && (
                      <>
                        <Pressable
                          onPress={() => handleReject(r.id)}
                          style={({ pressed }) => [
                            styles.rejectChip,
                            pressed && styles.chipPressed,
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.rejectChipText}>Reject</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleApprove(r.id)}
                          style={({ pressed }) => [
                            styles.approveChip,
                            pressed && styles.chipPressed,
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.approveChipText}>Approve</Text>
                        </Pressable>
                      </>
                    )}
                    {/* Edit chip — submitter only. Status/review fields are
                        locked by the DB trigger; only title/content/type may
                        actually change via this flow. */}
                    {isSubmitter && (
                      <Pressable
                        onPress={() => handleEdit(r)}
                        style={({ pressed }) => [styles.editChip, pressed && styles.chipPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${r.title}`}
                      >
                        <Text style={styles.editChipText}>Edit</Text>
                      </Pressable>
                    )}
                    {canDelete && (
                      <Pressable
                        onPress={() => handleDelete(r.id, r.title)}
                        style={({ pressed }) => [
                          styles.deleteChip,
                          pressed && styles.chipPressed,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.deleteChipText}>Delete</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
    </>
  )
}

// Same StatusBadge shape used in announcements, scoped here so this file
// stays self-contained. Approved is rendered too (matters for reports
// because every row carries a decision once reviewed).
function StatusBadge({ status }: { status: ReportStatus }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const map = {
    pending: { bg: theme.color.warningSubtle, fg: theme.color.warning, label: 'Pending' },
    approved: { bg: theme.color.successSubtle, fg: theme.color.success, label: 'Approved' },
    rejected: { bg: theme.color.dangerSubtle, fg: theme.color.danger, label: 'Rejected' },
  }[status]
  return (
    <View style={[styles.statusPill, { backgroundColor: map.bg }]}>
      <Text style={[styles.statusPillText, { color: map.fg }]}>{map.label}</Text>
    </View>
  )
}

// Activity / Financial toggle button. Active state takes brand color so the
// choice reads at a glance.
function TypeButton({
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
      style={[styles.typeButton, active && styles.typeButtonActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>{label}</Text>
    </Pressable>
  )
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
    // Activity / Financial toggle.
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
    typeButtonActive: {
      backgroundColor: t.color.brand,
      borderColor: t.color.brand,
    },
    typeButtonText: {
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.textMuted,
    },
    typeButtonTextActive: {
      color: t.color.onBrand,
    },
    // Taller multi-line input for the report body.
    contentInput: {
      minHeight: 120,
      textAlignVertical: 'top',
    },
    // Report card.
    reportCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    reportTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.space.sm,
      gap: t.space.sm,
    },
    typePill: {
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.brandSubtle,
    },
    typePillText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    statusPill: {
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
    },
    statusPillText: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    reportTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.sm,
    },
    reportContent: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
      marginBottom: t.space.md,
    },
    // Reviewer feedback block — visually distinct so it reads as a quote.
    reviewBlock: {
      backgroundColor: t.color.surfaceMuted,
      borderRadius: t.radius.md,
      padding: t.space.md,
      marginBottom: t.space.md,
      borderLeftWidth: 3,
      borderLeftColor: t.color.brand,
    },
    reviewBlockLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    reviewBlockText: {
      fontSize: t.font.size.bodySm,
      color: t.color.text,
      fontStyle: 'italic',
    },
    reportFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: t.space.sm,
      paddingTop: t.space.sm,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    reportMeta: {
      flex: 1,
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
    actionRow: {
      flexDirection: 'row',
      gap: t.space.sm,
    },
    deleteChip: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.dangerSubtle,
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    // Edit chip — brand-toned to differentiate from destructive Delete.
    editChip: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.brandSubtle,
      borderWidth: 1,
      borderColor: t.color.brand,
    },
    editChipText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    // Cancel link below the composer when editing.
    cancelEdit: {
      alignSelf: 'center',
      marginTop: t.space.sm,
      minHeight: t.touchTarget,
      justifyContent: 'center',
    },
    cancelEditText: {
      color: t.color.textMuted,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    deleteChipText: {
      fontSize: t.font.size.caption,
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
    },
    approveChip: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.successSubtle,
      borderWidth: 1,
      borderColor: t.color.success,
    },
    approveChipText: {
      fontSize: t.font.size.caption,
      color: t.color.success,
      fontWeight: t.font.weight.semibold,
    },
    rejectChip: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.warningSubtle,
      borderWidth: 1,
      borderColor: t.color.warning,
    },
    rejectChipText: {
      fontSize: t.font.size.caption,
      color: t.color.warning,
      fontWeight: t.font.weight.semibold,
    },
    chipPressed: {
      backgroundColor: t.color.surfaceMuted,
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
