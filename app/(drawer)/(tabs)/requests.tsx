// ─────────────────────────────────────────────────────────────────────────────
// Requests tab — role-aware.
//
// What this screen does:
//   • If the signed-in user is a regular student (role: 'student_member'),
//     it shows their own join requests with status (pending/approved/rejected).
//   • If the user is a 'club_officer', 'adviser', or 'faculty_coordinator',
//     it shows the pending queue of requests waiting for THEM to act on,
//     with Approve / Reject buttons inline on each card.
//
// One tab, two views — keeps the bottom-bar simple and means a club officer
// (who is also a student) sees the queue that's actually useful to them.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import {
  approveRequest,
  getMyRequests,
  getPendingForReviewer,
  rejectRequest,
} from '@/services/clubs.service'
import { JoinRequestStatus, JoinRequestWithOrg, JoinRequestWithUser } from '@/types'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function RequestsScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user, profile } = useAuth()

  // 'student_member' = view their own outgoing requests.
  // Anything else (officer / adviser / faculty coordinator) = view the
  // approval queue. We still show the queue to club_officers because they
  // are the primary reviewers from inside the student body.
  const mode: 'student' | 'reviewer' =
    profile?.role === 'student_member' ? 'student' : 'reviewer'

  // The two modes hold different row shapes — discriminated by `mode`.
  const [studentRows, setStudentRows] = useState<JoinRequestWithOrg[]>([])
  const [reviewerRows, setReviewerRows] = useState<JoinRequestWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    if (mode === 'student') {
      const { data, error } = await getMyRequests(user.id)
      if (error) setError(error)
      else {
        setStudentRows(data ?? [])
        setError(null)
      }
    } else {
      const { data, error } = await getPendingForReviewer(user.id)
      if (error) setError(error)
      else {
        setReviewerRows(data ?? [])
        setError(null)
      }
    }
  }, [user, mode])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Wraps approveRequest/rejectRequest: confirm → call → optimistic remove.
  // We splice the row out of state immediately so the UI feels snappy; a
  // failed network call shows an Alert and re-runs load() to resync.
  const handleReview = async (
    requestId: string,
    action: 'approve' | 'reject'
  ) => {
    if (!user) return
    const label = action === 'approve' ? 'Approve' : 'Reject'
    Alert.alert(
      `${label} request?`,
      action === 'approve'
        ? 'This student will become a member of the club.'
        : 'The student will see their request was rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            // Optimistic removal — disappears from the queue right away.
            setReviewerRows((prev) => prev.filter((r) => r.id !== requestId))
            const fn = action === 'approve' ? approveRequest : rejectRequest
            const { error } = await fn(requestId, user.id)
            if (error) {
              Alert.alert(`${label} failed`, error)
              // Out of sync now — pull the truth from the server.
              load()
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  // ── Reviewer mode (officer / adviser / faculty) ──────────────────────────
  if (mode === 'reviewer') {
    return (
      <FlatList
        data={reviewerRows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Approvals</Text>
            <Text style={styles.title}>Pending Requests</Text>
            <Text style={styles.subtitle}>Review join requests for your clubs</Text>
            {error && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No pending requests right now.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.user.full_name}</Text>
            <Text style={styles.cardSubtitle}>wants to join {item.organization.name}</Text>
            {/* Optional applicant message — only render the block if it's non-empty. */}
            {item.message ? (
              <Text style={styles.cardMessage}>&ldquo;{item.message}&rdquo;</Text>
            ) : null}
            <Text style={styles.cardMeta}>{formatDate(item.requested_at)}</Text>
            <View style={styles.actionRow}>
              <View style={styles.actionHalf}>
                <Button
                  label="Reject"
                  variant="secondary"
                  onPress={() => handleReview(item.id, 'reject')}
                />
              </View>
              <View style={styles.actionHalf}>
                <Button
                  label="Approve"
                  onPress={() => handleReview(item.id, 'approve')}
                />
              </View>
            </View>
          </View>
        )}
      />
    )
  }

  // ── Student mode (own outgoing requests) ─────────────────────────────────
  return (
    <FlatList
      data={studentRows}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>My Activity</Text>
          <Text style={styles.title}>My Requests</Text>
          <Text style={styles.subtitle}>Status of clubs you&apos;ve applied to</Text>
          {error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            You haven&apos;t requested to join any clubs yet.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.organization.name}</Text>
          <Text style={styles.cardMeta}>Requested {formatDate(item.requested_at)}</Text>
          <StatusPill status={item.status} />
        </View>
      )}
    />
  )
}

// Small visual indicator: pending = neutral, approved = green, rejected = red.
// Pulled out so the status mapping lives in one place.
function StatusPill({ status }: { status: JoinRequestStatus }) {
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

// Lightweight date formatter — keeps this file dependency-free.
// Returns "May 18, 2026"-style strings; falls back to the raw value if parsing fails.
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
    listContent: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    header: {
      marginBottom: t.space.lg,
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
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
      // Switched from `accent` (amber) to `text` (near-black) for cleaner
      // hierarchy. The status pills below still carry color.
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
      marginBottom: t.space.md,
    },
    errorBanner: {
      backgroundColor: t.color.dangerSubtle,
      borderRadius: t.radius.sm,
      padding: t.space.md,
      borderLeftWidth: 4,
      borderLeftColor: t.color.danger,
    },
    errorText: {
      color: t.color.danger,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    cardTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    cardSubtitle: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      color: t.color.textMuted,
      marginBottom: t.space.sm,
    },
    cardMessage: {
      fontSize: t.font.size.bodySm,
      color: t.color.text,
      fontStyle: 'italic',
      marginBottom: t.space.sm,
    },
    cardMeta: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      marginBottom: t.space.md,
    },
    actionRow: {
      flexDirection: 'row',
      gap: t.space.sm,
    },
    actionHalf: {
      flex: 1,
    },
    statusPill: {
      alignSelf: 'flex-start',
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.md,
      paddingVertical: 4,
    },
    statusPillText: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    empty: {
      paddingVertical: t.space['3xl'],
      alignItems: 'center',
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
      textAlign: 'center',
    },
  })
