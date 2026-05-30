// ─────────────────────────────────────────────────────────────────────────────
// Chat tab — Messenger-style list of every club the user can chat in.
//
// What this screen does:
//   • Lists every club the caller is a member of (any role) OR the named
//     adviser/faculty coordinator for, sorted by most-recent-message first.
//   • Each row shows: club name, latest message preview, time, and a red
//     unread badge ("9+" cap) when there are new messages.
//   • Tapping a row pushes /club/[id]/chat, which subscribes to realtime and
//     bumps last_read_messages_at on mount → badge clears here on refocus.
//   • Pull-to-refresh re-fetches everything; re-fetches happen automatically
//     on every focus too, so coming back from a chat updates the previews.
//
// Why this lives at the tab level: chat is something users check often and
// expect to find in one place (like Messenger). Buried-per-club access still
// exists via the club detail screen, but the tab is the primary entry point.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { ChatRoomSummary, listChatRoomsForUser } from '@/services/chat.service'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function ChatTabScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [rooms, setRooms] = useState<ChatRoomSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setRooms([])
      return
    }
    const { data, error } = await listChatRoomsForUser(user.id)
    if (error) {
      setError(error)
    } else {
      setRooms(data ?? [])
      setError(null)
    }
  }, [user])

  // Refetch on every focus — covers: returning from a chat (badge should
  // clear), pull-to-refresh elsewhere, deep-link entry.
  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, [load])
  )

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
    <FlatList
      data={rooms}
      keyExtractor={(r) => r.organization_id}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Pampanga High School</Text>
          <Text style={styles.title}>Chats</Text>
          <Text style={styles.subtitle}>One room per club you belong to</Text>
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
            You aren&apos;t in any clubs yet. Join one from the Clubs tab to start chatting.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const preview = item.lastMessage
          ? formatPreview(
              item.lastMessage.body,
              item.lastMessage.author_name,
              item.lastMessage.author_id === user?.id
            )
          : 'No messages yet — say hi to your club.'
        const time = item.lastMessage ? formatRelative(item.lastMessage.created_at) : ''
        const unreadLabel = item.unreadCount > 9 ? '9+' : String(item.unreadCount)
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              `Open ${item.organization_name} chat` +
              (item.unreadCount > 0 ? `, ${item.unreadCount} unread` : '')
            }
            onPress={() => router.push(`/club/${item.organization_id}/chat` as never)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            {/* Avatar — club cover image if set, otherwise an initial circle. */}
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {item.organization_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={styles.rowBody}>
              <View style={styles.rowTopLine}>
                <Text
                  style={[styles.clubName, item.unreadCount > 0 && styles.clubNameUnread]}
                  numberOfLines={1}
                >
                  {item.organization_name}
                </Text>
                {!!time && (
                  <Text
                    style={[styles.time, item.unreadCount > 0 && styles.timeUnread]}
                    numberOfLines={1}
                  >
                    {time}
                  </Text>
                )}
              </View>
              <View style={styles.rowBottomLine}>
                <Text
                  style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]}
                  numberOfLines={1}
                >
                  {preview}
                </Text>
                {item.unreadCount > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{unreadLabel}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )
      }}
    />
  )
}

// "You: see you there" / "Jane: hey y'all" — prefix the speaker so the reader
// can tell who spoke without opening the chat. Own messages read "You:".
function formatPreview(body: string, authorName: string | null, isSelf: boolean): string {
  if (isSelf) return `You: ${body}`
  if (!authorName) return body
  return `${authorName}: ${body}`
}

// Cheap relative-time formatter — good enough for a chat preview. Buckets:
//   < 1 min   → "now"
//   < 1 hour  → "Nm"
//   < 1 day   → "Nh"
//   < 7 days  → "Nd"
//   else      → MM/DD
function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffSec = Math.max(0, Math.floor((now - then) / 1000))
  if (diffSec < 60) return 'now'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
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
      color: t.color.text,
    },
    subtitle: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginTop: t.space.xs,
    },
    errorBanner: {
      marginTop: t.space.md,
      backgroundColor: t.color.dangerSubtle,
      borderRadius: t.radius.md,
      padding: t.space.md,
    },
    errorText: {
      color: t.color.danger,
      fontSize: t.font.size.bodySm,
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
    // ── Room row (one per club) ────────────────────────────────────────────
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.md,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    rowPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: t.color.surfaceMuted,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.color.brandSubtle,
    },
    avatarInitial: {
      fontSize: t.font.size.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    rowBody: {
      flex: 1,
      gap: 2,
    },
    rowTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
    },
    rowBottomLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
    },
    clubName: {
      flex: 1,
      fontSize: t.font.size.body,
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
    },
    clubNameUnread: {
      fontWeight: t.font.weight.bold,
    },
    time: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
    timeUnread: {
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    preview: {
      flex: 1,
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    previewUnread: {
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
    },
    // Facebook-style red badge with white number.
    notifBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: t.color.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifBadgeText: {
      color: '#FFFFFF',
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      fontWeight: t.font.weight.bold,
    },
  })
