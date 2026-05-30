// ─────────────────────────────────────────────────────────────────────────────
// Club chat screen — group chat per organization.
//
// Layout: inverted FlatList of messages (newest at the bottom, like every
// chat app on the planet), with a composer pinned to the bottom inside a
// KeyboardAvoidingView so the input rises above the keyboard.
//
// Realtime: on mount we subscribe to INSERT + DELETE events for THIS club's
// messages via chat.service.subscribeToMessages. New rows are merged into
// local state; deletes prune them.
//
// Permissions:
//   • Read / post — any member of the club (members, officers, advisers,
//     faculty coordinators). RLS does the real gating.
//   • Delete — the author OR any officer/adviser/faculty coordinator of this
//     club. The UI only shows the delete chip when the caller can use it.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import {
  CHAT_PAGE_SIZE,
  deleteMessage,
  editMessage,
  listMessages,
  listMessagesBefore,
  markChatRead,
  reportMessage,
  sendMessage,
  subscribeToMessages,
} from '@/services/chat.service'
import { getClubDetail } from '@/services/clubs.service'
import { ClubDetail, ClubMessageWithAuthor } from '@/types'
import { toastSuccess } from '@/utils/toast'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export default function ClubChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [messages, setMessages] = useState<ClubMessageWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Edit mode: when set, the composer is editing this message instead of
  // sending a new one. null = normal "new message" mode.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Pagination for "load earlier": hasMore stays true until a short page comes
  // back; loadingMore guards against firing the loader repeatedly while a
  // fetch is in flight.
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Local lookup: user_id → display name. Populated from the club's member list
  // + the named adviser, so realtime INSERTs (which arrive without joined
  // author profiles) can resolve a name without a second query.
  const nameMap = useMemo(() => {
    const m = new Map<string, string>()
    if (club?.adviser) m.set(club.adviser.id, club.adviser.full_name)
    club?.members.forEach((mem) => m.set(mem.id, mem.full_name))
    return m
  }, [club])

  // Is the caller an officer or adviser of THIS club? Drives the delete chip
  // visibility for messages they didn't author. Computed from the fetched
  // detail blob so it stays consistent with the rest of the app.
  const isModerator = useMemo(() => {
    if (!user || !club) return false
    if (user.id === club.adviser_id || user.id === club.faculty_coordinator_id) return true
    return club.members.some((mem) => mem.id === user.id && mem.role_in_club === 'officer')
  }, [user, club])

  // Initial load: club detail (for members/adviser) + recent messages, in
  // parallel. Realtime takes over for new messages from here on.
  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, msgsRes] = await Promise.all([getClubDetail(id), listMessages(id)])
    if (clubRes.data) setClub(clubRes.data)
    if (msgsRes.data) {
      setMessages(msgsRes.data)
      // If the first page came back short, there's nothing older to load.
      setHasMore(msgsRes.data.length >= CHAT_PAGE_SIZE)
    }
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Load older messages when the user scrolls to the top of the (inverted)
  // list. Prepends them to the oldest-first `messages` array. Guards against
  // concurrent loads and stops once a short page returns.
  const loadOlder = useCallback(async () => {
    if (!id || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const oldest = messages[0]
    const { data } = await listMessagesBefore(id, oldest.created_at)
    setLoadingMore(false)
    if (data) {
      if (data.length > 0) {
        setMessages((prev) => {
          // De-dupe against anything already present (defensive).
          const existing = new Set(prev.map((m) => m.id))
          const fresh = data.filter((m) => !existing.has(m.id))
          return [...fresh, ...prev]
        })
      }
      if (data.length < CHAT_PAGE_SIZE) setHasMore(false)
    }
  }, [id, loadingMore, hasMore, messages])

  // Clear the unread badge for this club once the user has landed on the chat.
  // Fire-and-forget — failure is non-fatal (worst case: the badge lingers
  // until next refresh, which the Clubs list will retry on focus anyway).
  useEffect(() => {
    if (id && user) markChatRead(id, user.id)
  }, [id, user])

  // Realtime subscription — mounted once per (id) and torn down on unmount.
  // Inserts append; the FlatList is inverted so they appear at the visual
  // bottom automatically.
  //
  // BUG FIX: every realtime INSERT also bumps last_read_messages_at via
  // markChatRead. Two reasons:
  //   1. The author's own echo would otherwise count against THEIR unread
  //      total — sending a message would notify yourself, which is wrong.
  //   2. Messages from others that arrive while the user is actively viewing
  //      the chat have, by definition, been seen — they shouldn't ping the
  //      badge when the user navigates back to the Chat tab.
  useEffect(() => {
    if (!id) return
    const unsubscribe = subscribeToMessages(
      id,
      (row) => {
        setMessages((prev) => {
          // De-dupe: our own optimistic insert might race the realtime echo.
          if (prev.some((m) => m.id === row.id)) return prev
          return [
            ...prev,
            {
              ...row,
              author: row.author_id
                ? { id: row.author_id, full_name: nameMap.get(row.author_id) ?? 'Member' }
                : null,
            },
          ]
        })
        // Acknowledge: bump the caller's read timestamp so this message
        // doesn't drive their unread badge. Fire-and-forget — RLS only lets
        // them update their own membership row, so the worst case is a no-op
        // (e.g. for adviser-only access where there's no membership row).
        if (user) markChatRead(id, user.id)
      },
      (deletedId) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId))
      },
      // onUpdate — an edit landed; patch the body + edited_at in place,
      // preserving the locally-resolved author.
      (row) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === row.id ? { ...m, body: row.body, edited_at: row.edited_at } : m
          )
        )
      }
    )
    return unsubscribe
  }, [id, nameMap, user])

  const handleSend = async () => {
    if (!id || !user) return
    const text = draft.trim()
    if (!text) return

    // Edit mode — update the existing message instead of sending a new one.
    if (editingId) {
      setSending(true)
      const { data, error } = await editMessage(editingId, text)
      setSending(false)
      if (error || !data) {
        Alert.alert('Could not save edit', error ?? 'Please try again.')
        return
      }
      // Patch locally now; realtime UPDATE will also arrive (idempotent).
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingId ? { ...m, body: data.body, edited_at: data.edited_at } : m
        )
      )
      setEditingId(null)
      setDraft('')
      return
    }

    setSending(true)
    const { data, error } = await sendMessage(id, user.id, text)
    setSending(false)
    if (error || !data) {
      Alert.alert('Could not send', error ?? 'Please try again.')
      return
    }
    // BUG FIX: mark read immediately after the insert succeeds. The realtime
    // echo will also fire markChatRead (see the subscription effect above),
    // but the user could navigate to the Chat tab between "INSERT committed"
    // and "echo delivered" and briefly see a phantom badge for their own
    // message. Calling it here closes the race.
    markChatRead(id, user.id)
    // Clear the composer; realtime will deliver the row to setMessages (and
    // the de-dupe guard handles the round-trip echo).
    setDraft('')
  }

  // Enter edit mode: load the message body into the composer.
  const startEdit = (item: ClubMessageWithAuthor) => {
    setEditingId(item.id)
    setDraft(item.body)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  // Long-press menu — contextual to who you are relative to the message:
  //   • Anyone (except the author) can Report it for review.
  //   • The author or a moderator (officer/adviser/faculty) can Delete it.
  const handleLongPress = (item: ClubMessageWithAuthor) => {
    const isMine = item.author_id === user?.id
    const canDelete = isMine || isModerator
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = []
    if (isMine) {
      buttons.push({ text: 'Edit message', onPress: () => startEdit(item) })
    }
    if (!isMine) {
      buttons.push({ text: 'Report message', onPress: () => promptReportReason(item) })
    }
    if (canDelete) {
      buttons.push({ text: 'Delete message', style: 'destructive', onPress: () => confirmDelete(item.id) })
    }
    buttons.push({ text: 'Cancel', style: 'cancel' })
    Alert.alert('Message options', undefined, buttons)
  }

  // Preset reasons keep reporting one-tap and work cross-platform (no text
  // prompt, which is iOS-only). The reviewer sees the message itself anyway.
  const promptReportReason = (item: ClubMessageWithAuthor) => {
    Alert.alert('Report this message?', 'Pick a reason. An officer or adviser will review it.', [
      { text: 'Inappropriate content', onPress: () => submitReport(item, 'Inappropriate content') },
      { text: 'Spam', onPress: () => submitReport(item, 'Spam') },
      { text: 'Harassment or bullying', onPress: () => submitReport(item, 'Harassment or bullying') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const submitReport = async (item: ClubMessageWithAuthor, reason: string) => {
    if (!id || !user) return
    const { error } = await reportMessage(item.id, id, user.id, reason)
    if (error) {
      Alert.alert('Could not report', error)
      return
    }
    toastSuccess('Reported', 'Thanks — an officer or adviser will review it.')
  }

  const confirmDelete = (messageId: string) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic remove — realtime DELETE will also fire and is a no-op
          // because the row's already gone from local state.
          setMessages((prev) => prev.filter((m) => m.id !== messageId))
          const { error } = await deleteMessage(messageId)
          if (error) {
            Alert.alert('Could not delete', error)
            // Best-effort refetch to undo the optimistic removal.
            const re = await listMessages(club?.id ?? '')
            if (re.data) setMessages(re.data)
          }
        },
      },
    ])
  }

  // Reverse for the inverted FlatList — service returns oldest-first; inverted
  // list expects newest-first as the data array's first item.
  const reversed = useMemo(() => [...messages].reverse(), [messages])

  // Auto-scroll to bottom (= visual top in an inverted list = index 0) is
  // implicit because new items are prepended after reverse. The ref is kept
  // in case we want to add a "jump to newest" affordance later.
  const listRef = useRef<FlatList<ClubMessageWithAuthor>>(null)

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
      <Stack.Screen options={{ title: `${club.name} Chat`, headerShown: true }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          data={reversed}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          // Inverted list: the "end" is the visual TOP, so this fires when the
          // user scrolls up to the oldest loaded message → page in older ones.
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          // Footer of an inverted list renders at the TOP — perfect spot for
          // the "loading earlier messages" spinner.
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={theme.color.textSubtle} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              {/* Inverted list flips the empty state too — counter-rotate so
                  the text reads normally instead of upside-down. */}
              <Text style={[styles.emptyText, styles.emptyFlip]}>
                No messages yet. Say hi to your club.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.author_id === user?.id
            return (
              <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
                <Pressable
                  onLongPress={() => handleLongPress(item)}
                  delayLongPress={300}
                  style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
                  accessibilityRole="button"
                  accessibilityLabel={`Message from ${
                    isMine ? 'you' : item.author?.full_name ?? 'member'
                  }. Long-press for options.`}
                >
                  {!isMine &&
                    (item.author_id ? (
                      <Text
                        style={[styles.author, styles.authorLink]}
                        onPress={() => router.push(`/profile/${item.author_id}` as never)}
                        accessibilityRole="link"
                        accessibilityLabel={`View ${item.author?.full_name ?? 'member'}'s profile`}
                      >
                        {item.author?.full_name ?? 'Member'}
                      </Text>
                    ) : (
                      <Text style={styles.author}>Deleted user</Text>
                    ))}
                  <Text style={[styles.body, isMine && styles.bodyMine]}>{item.body}</Text>
                  <Text style={[styles.time, isMine && styles.timeMine]}>
                    {formatTime(item.created_at)}
                    {item.edited_at ? ' · edited' : ''}
                  </Text>
                </Pressable>
              </View>
            )
          }}
        />

        {/* Edit-mode banner — shows which message is being edited with a
            quick Cancel. Only rendered while editingId is set. */}
        {editingId && (
          <View style={styles.editBanner}>
            <Text style={styles.editBannerText} numberOfLines={1}>
              Editing message
            </Text>
            <Pressable onPress={cancelEdit} hitSlop={8} accessibilityRole="button">
              <Text style={styles.editBannerCancel}>Cancel</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={editingId ? 'Edit your message…' : 'Message your club…'}
            placeholderTextColor={theme.color.textSubtle}
            style={styles.input}
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              (sending || !draft.trim()) && styles.sendButtonDisabled,
              pressed && styles.sendButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={editingId ? 'Save edit' : 'Send message'}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.color.onBrand} />
            ) : (
              <Text style={styles.sendButtonText}>{editingId ? 'Save' : 'Send'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  )
}

// Tiny HH:MM formatter — no timezone library needed for a chat timestamp.
function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ampm}`
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.color.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.background,
    },
    listContent: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      gap: t.space.xs,
      flexGrow: 1,
    },
    loadingMore: {
      paddingVertical: t.space.md,
      alignItems: 'center',
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.space.xl,
    },
    // Inverted FlatList rotates content 180° — counter-rotate the empty state
    // so it reads right-side-up.
    emptyFlip: {
      transform: [{ scaleY: -1 }],
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
      textAlign: 'center',
    },
    // ── Message rows ─────────────────────────────────────────────────────
    row: {
      flexDirection: 'row',
      marginBottom: t.space.xs,
    },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    bubble: {
      maxWidth: '80%',
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
    },
    bubbleMine: {
      backgroundColor: t.color.brand,
      borderBottomRightRadius: t.radius.sm,
    },
    bubbleTheirs: {
      backgroundColor: t.color.surface,
      borderBottomLeftRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    author: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      color: t.color.brandPressed,
      marginBottom: 2,
    },
    authorLink: {
      textDecorationLine: 'underline',
    },
    body: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
    },
    bodyMine: {
      color: t.color.onBrand,
    },
    time: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      alignSelf: 'flex-end',
      marginTop: 2,
    },
    timeMine: {
      color: t.color.onBrand,
      opacity: 0.8,
    },
    // ── Edit-mode banner ─────────────────────────────────────────────────
    editBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      backgroundColor: t.color.brandSubtle,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    editBannerText: {
      flex: 1,
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      color: t.color.brandPressed,
    },
    editBannerCancel: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      color: t.color.textMuted,
    },
    // ── Composer ─────────────────────────────────────────────────────────
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: t.space.sm,
      padding: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
      backgroundColor: t.color.surface,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      minHeight: 40,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      backgroundColor: t.color.inputBg,
      color: t.color.text,
      fontSize: t.font.size.body,
    },
    sendButton: {
      backgroundColor: t.color.brand,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.lg,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonPressed: {
      backgroundColor: t.color.brandPressed,
    },
    sendButtonText: {
      color: t.color.onBrand,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
    },
  })
