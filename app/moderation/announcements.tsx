// ─────────────────────────────────────────────────────────────────────────────
// Global Moderation Queue — Announcements.
//
// Audience: club advisers and faculty coordinators.
//
// What this screen does:
//   • Lists every PENDING announcement across every club the user advises.
//     Oldest first so the longest-waiting submissions surface first.
//   • Each card shows author, club, title, body, and submission date.
//   • Tapping a card opens that club's announcements screen where the
//     adviser can use the existing Approve / Reject UI (we don't duplicate
//     the moderation buttons here — single source of truth per club).
//
// If the user advises no clubs (or there are no pending posts), shows an
// empty state.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { listPendingForReviewer } from '@/services/announcement.service'
import { AnnouncementFeedItem } from '@/types'
import { router, Stack } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function PendingAnnouncementsScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [rows, setRows] = useState<AnnouncementFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await listPendingForReviewer(user.id)
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Pending Announcements', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Moderation</Text>
          <Text style={styles.title}>Pending Announcements</Text>
          <Text style={styles.subtitle}>
            Tap a card to review and approve or reject it in its club.
          </Text>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No announcements waiting for review.</Text>
          </View>
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/club/${r.organization.id}/announcements` as never)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Review ${r.title} for ${r.organization.name}`}
            >
              <View style={styles.cardTop}>
                <View style={styles.clubPill}>
                  <Text style={styles.clubPillText}>{r.organization.name}</Text>
                </View>
                <Text style={styles.dateText}>{formatDate(r.posted_at)}</Text>
              </View>
              <Text style={styles.cardTitle}>{r.title}</Text>
              <Text style={styles.cardBody} numberOfLines={3}>
                {r.content}
              </Text>
              <Text style={styles.cardMeta}>
                Submitted by {r.author?.full_name ?? 'Unknown'}
              </Text>
            </Pressable>
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
    cardPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.space.sm,
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
    dateText: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
    cardTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    cardBody: {
      fontSize: t.font.size.bodySm,
      color: t.color.text,
      marginBottom: t.space.sm,
    },
    cardMeta: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
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
