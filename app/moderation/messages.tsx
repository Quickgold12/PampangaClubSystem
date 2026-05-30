// ─────────────────────────────────────────────────────────────────────────────
// Moderation Queue — Reported Messages.
//
// Audience: club officers, advisers, and faculty coordinators (anyone who can
// delete a message can review reports against it).
//
// Each card shows the reported message, who reported it and why, and two
// actions:
//   • Keep    — dismiss the report, the message stays (status → resolved).
//   • Delete  — remove the offending message (status effectively → removed;
//               the message row + its reports are deleted via FK cascade).
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { listPendingMessageReports, resolveMessageReport } from '@/services/chat.service'
import { MessageReportFeedItem } from '@/types'
import { Stack } from 'expo-router'
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

export default function ReportedMessagesScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [rows, setRows] = useState<MessageReportFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [acting, setActing] = useState<string | null>(null) // report id being acted on

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await listPendingMessageReports(user.id)
    setRows(data ?? [])
  }, [user])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const act = async (
    report: MessageReportFeedItem,
    action: 'resolved' | 'removed'
  ) => {
    if (!user) return
    setActing(report.id)
    const { error } = await resolveMessageReport(
      report.id,
      user.id,
      action,
      report.message?.id
    )
    setActing(null)
    if (error) {
      Alert.alert('Action failed', error)
      return
    }
    // Drop the handled report from the local list immediately.
    setRows((prev) => prev.filter((r) => r.id !== report.id))
  }

  const confirmDelete = (report: MessageReportFeedItem) => {
    Alert.alert('Delete this message?', 'It will be removed for everyone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act(report, 'removed') },
    ])
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
      <Stack.Screen options={{ title: 'Reported Messages', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Moderation</Text>
          <Text style={styles.title}>Reported Messages</Text>
          <Text style={styles.subtitle}>
            Review flagged chat messages. Keep the message or remove it.
          </Text>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No reported messages. All clear.</Text>
          </View>
        ) : (
          rows.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.clubPill}>
                  <Text style={styles.clubPillText}>{r.organization.name}</Text>
                </View>
                <View style={styles.reasonPill}>
                  <Text style={styles.reasonPillText}>{r.reason}</Text>
                </View>
              </View>

              {/* The reported message itself. */}
              {r.message ? (
                <View style={styles.quote}>
                  <Text style={styles.quoteAuthor}>
                    {r.message.author_name ?? 'Deleted user'}
                  </Text>
                  <Text style={styles.quoteBody}>{r.message.body}</Text>
                </View>
              ) : (
                <Text style={styles.deletedNote}>This message was already deleted.</Text>
              )}

              <Text style={styles.cardMeta}>
                Reported by {r.reporter?.full_name ?? 'a member'} • {formatDate(r.created_at)}
              </Text>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => act(r, 'resolved')}
                  disabled={acting === r.id}
                  style={({ pressed }) => [styles.keepBtn, pressed && styles.btnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Keep message and dismiss report"
                >
                  <Text style={styles.keepBtnText}>Keep</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(r)}
                  disabled={acting === r.id || !r.message}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    (acting === r.id || !r.message) && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete the reported message"
                >
                  {acting === r.id ? (
                    <ActivityIndicator size="small" color={theme.color.textInverse} />
                  ) : (
                    <Text style={styles.deleteBtnText}>Delete message</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  )
}

const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      color: t.color.textMuted,
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
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.space.sm,
      gap: t.space.sm,
    },
    clubPill: {
      backgroundColor: t.color.brandSubtle,
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
    },
    clubPillText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    reasonPill: {
      backgroundColor: t.color.dangerSubtle,
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
    },
    reasonPillText: {
      fontSize: t.font.size.caption,
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
    },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: t.color.border,
      paddingLeft: t.space.md,
      marginBottom: t.space.sm,
    },
    quoteAuthor: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      color: t.color.textMuted,
      marginBottom: 2,
    },
    quoteBody: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
    },
    deletedNote: {
      fontSize: t.font.size.bodySm,
      fontStyle: 'italic',
      color: t.color.textSubtle,
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
    keepBtn: {
      flex: 1,
      backgroundColor: t.color.surfaceMuted,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
    },
    keepBtnText: {
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
    },
    deleteBtn: {
      flex: 1,
      backgroundColor: t.color.danger,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
    },
    deleteBtnText: {
      color: t.color.textInverse,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    btnPressed: {
      opacity: 0.85,
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
