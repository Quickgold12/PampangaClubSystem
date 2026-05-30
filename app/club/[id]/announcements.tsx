// ─────────────────────────────────────────────────────────────────────────────
// Announcements screen — read by every member, posted by officers/advisers.
//
// What this screen does:
//   • Lists every announcement for the club, newest first.
//   • If the user is an officer/adviser, shows a "New Post" composer card
//     above the list (title + content + post button).
//   • Each post displays title, body, author, and timestamp.
//   • Officers/advisers see a small Delete chip on each card.
//   • On mount, marks the club as "read" (bumps last_read_announcements_at)
//     so the home dashboard's unread badge clears.
//
// Members see "read-only" — no composer, no delete chips.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import {
  approveAnnouncement,
  deleteAnnouncement,
  listForClub,
  markClubRead,
  postAnnouncement,
  rejectAnnouncement,
  updateAnnouncement,
} from '@/services/announcement.service'
import { getClubDetail } from '@/services/clubs.service'
import { AnnouncementStatus, AnnouncementWithAuthor, ClubDetail } from '@/types'
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
  TextInput,
  View,
} from 'react-native'

export default function AnnouncementsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [posts, setPosts] = useState<AnnouncementWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('') // search box — filters by title/content

  // Composer state — used for both posting NEW and editing EXISTING posts.
  // editingId === null → composer creates a new post.
  // editingId === '<id>' → composer is editing that post; save calls update.
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  // Pull the club blob + announcement list in parallel.
  const load = useCallback(async () => {
    if (!id) return
    const [clubRes, postsRes] = await Promise.all([getClubDetail(id), listForClub(id)])
    if (clubRes.data) setClub(clubRes.data)
    if (postsRes.data) setPosts(postsRes.data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Mark the club as read once the user has actually landed on this screen.
  // Fire-and-forget — failure is non-fatal (worst case: unread badge stays).
  useEffect(() => {
    if (id && user) {
      markClubRead(id, user.id)
    }
  }, [id, user])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Role checks for this specific club, all derived locally so the JSX stays
  // simple. None of these reach into profile.role — we trust per-club state.
  //
  //   isMember     → is in the memberships list for this club (any role)
  //   canPostDirect → officer/adviser/faculty: post lands as 'approved'
  //   canSubmit    → any member: post lands as 'pending' for adviser review
  //   isModerator  → adviser/faculty only: can approve/reject pending posts
  //                  (student officers can post but cannot moderate others)
  const isMember = !!user && !!club && club.members.some((m) => m.id === user.id)
  const isAdviser =
    !!user &&
    !!club &&
    (user.id === club.adviser_id || user.id === club.faculty_coordinator_id)
  const isOfficer =
    !!user && !!club && club.members.some((m) => m.id === user.id && m.role_in_club === 'officer')

  const canPostDirect = isAdviser || isOfficer
  const canSubmit = isMember && !canPostDirect // members who aren't officers/advisers
  const isModerator = isAdviser

  // Client-side search — case-insensitive match against title + content. The
  // list per club is small, so filtering in memory beats a round-trip per
  // keystroke.
  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return posts
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
    )
  }, [posts, query])

  // Reset the composer back to "create new" mode.
  const resetComposer = () => {
    setTitle('')
    setContent('')
    setEditingId(null)
  }

  // Switch the composer into edit mode for a specific post (author only).
  const handleEdit = (post: AnnouncementWithAuthor) => {
    setEditingId(post.id)
    setTitle(post.title)
    setContent(post.content)
  }

  const handlePost = async () => {
    if (!id || !user) return
    const cleanTitle = sanitizeText(title)
    const cleanContent = sanitizeText(content)
    if (!cleanTitle) {
      Alert.alert('Missing title', 'Give your announcement a short headline.')
      return
    }
    if (!cleanContent) {
      Alert.alert('Missing content', 'Write the body of the announcement.')
      return
    }

    setPosting(true)
    // Two paths: editing an existing post → update; otherwise → create a new
    // one (with the asPending flag set for regular members).
    if (editingId) {
      const { error } = await updateAnnouncement(editingId, {
        title: cleanTitle,
        content: cleanContent,
      })
      setPosting(false)
      if (error) {
        Alert.alert('Could not save', error)
        return
      }
      resetComposer()
      await load()
      toastSuccess('Announcement updated')
      return
    }

    // asPending = true when the user is a regular member — the post will go
    // into the moderation queue. Officers/advisers post as approved.
    const { data, error } = await postAnnouncement(
      id,
      user.id,
      cleanTitle,
      cleanContent,
      canSubmit // asPending
    )
    setPosting(false)

    if (error) {
      Alert.alert('Could not post', error)
      return
    }
    resetComposer()
    await load()

    if (data?.status === 'pending') {
      toastSuccess('Submitted for review', 'Your adviser will see it in the moderation queue.')
    } else {
      toastSuccess('Posted')
    }
  }

  const handleApprove = (postId: string) => {
    Alert.alert('Approve post?', 'Members will be able to see this announcement.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          // Optimistic local update for snappy feel.
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, status: 'approved' as AnnouncementStatus } : p))
          )
          const { error } = await approveAnnouncement(postId)
          if (error) {
            Alert.alert('Approve failed', error)
            load()
          }
        },
      },
    ])
  }

  const handleReject = (postId: string) => {
    Alert.alert(
      'Reject post?',
      'The submitter will see it was rejected. Other members will not see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setPosts((prev) =>
              prev.map((p) => (p.id === postId ? { ...p, status: 'rejected' as AnnouncementStatus } : p))
            )
            const { error } = await rejectAnnouncement(postId)
            if (error) {
              Alert.alert('Reject failed', error)
              load()
            }
          },
        },
      ]
    )
  }

  const handleDelete = (postId: string, postTitle: string) => {
    Alert.alert('Delete announcement?', `"${postTitle}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic remove so the card vanishes immediately.
          setPosts((prev) => prev.filter((p) => p.id !== postId))
          const { error } = await deleteAnnouncement(postId)
          if (error) {
            Alert.alert('Delete failed', error)
            load() // resync on failure
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
      <Stack.Screen options={{ title: 'Announcements', headerShown: true }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Announcements</Text>
        </View>

        {/* Composer — visible to any club member. Adapts to:
              • create-new for officers/advisers  → "Post Announcement"
              • create-new for regular members    → "Submit for Review"
              • edit existing (author edit mode)  → "Save Changes" + Cancel */}
        {((canPostDirect || canSubmit) || editingId) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {editingId
                ? 'Edit Announcement'
                : canSubmit
                ? 'Submit Announcement'
                : 'New Post'}
            </Text>
            {canSubmit && !editingId && (
              <Text style={styles.helperText}>
                Your post will be reviewed by the club adviser before other members can see it.
              </Text>
            )}
            <Input
              label="Title"
              placeholder="Weekly meeting cancelled"
              value={title}
              onChangeText={setTitle}
              editable={!posting}
            />
            <Input
              label="Message"
              placeholder="Write the announcement here…"
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={4}
              editable={!posting}
              style={styles.contentInput}
            />
            <Button
              label={
                editingId ? 'Save Changes' : canSubmit ? 'Submit for Review' : 'Post Announcement'
              }
              onPress={handlePost}
              loading={posting}
            />
            {/* Cancel chip — only meaningful in edit mode. */}
            {editingId && (
              <Pressable
                onPress={resetComposer}
                style={styles.cancelEdit}
                hitSlop={8}
                disabled={posting}
                accessibilityRole="button"
              >
                <Text style={styles.cancelEditText}>Cancel</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Search box — only worth showing once there are posts to filter. */}
        {posts.length > 0 && (
          <TextInput
            style={styles.searchInput}
            placeholder="Search announcements…"
            placeholderTextColor={theme.color.textSubtle}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search announcements"
          />
        )}

        {/* Post list. RLS already filters what the caller can see; the only
            per-row UI logic here is the status pill (for non-approved rows)
            and the action chips at the bottom. */}
        {filteredPosts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {query.trim()
                ? `No announcements match "${query.trim()}".`
                : canPostDirect || canSubmit
                ? 'No announcements yet — be the first to post.'
                : 'No announcements yet. Check back later.'}
            </Text>
          </View>
        ) : (
          filteredPosts.map((p) => {
            const isAuthor = p.posted_by === user?.id
            // Delete chip shows only when the caller can actually delete the
            // row per RLS: author OR adviser/faculty. Officer-vs-officer
            // delete is now blocked at the DB layer too.
            const canDelete = isAuthor || isAdviser
            const canModerate = isModerator && p.status === 'pending'
            return (
              <View key={p.id} style={styles.postCard}>
                {p.status !== 'approved' && <StatusBadge status={p.status} />}
                <Text style={styles.postTitle}>{p.title}</Text>
                <Text style={styles.postContent}>{p.content}</Text>
                <View style={styles.postFooter}>
                  <Text style={styles.postMeta}>
                    {p.author?.full_name ?? 'Unknown'} • {formatDate(p.posted_at)}
                  </Text>
                  <View style={styles.actionRow}>
                    {/* Moderation chips — adviser/faculty only, pending only. */}
                    {canModerate && (
                      <>
                        <Pressable
                          onPress={() => handleReject(p.id)}
                          style={({ pressed }) => [
                            styles.rejectChip,
                            pressed && styles.deleteChipPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Reject ${p.title}`}
                        >
                          <Text style={styles.rejectChipText}>Reject</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleApprove(p.id)}
                          style={({ pressed }) => [
                            styles.approveChip,
                            pressed && styles.deleteChipPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Approve ${p.title}`}
                        >
                          <Text style={styles.approveChipText}>Approve</Text>
                        </Pressable>
                      </>
                    )}
                    {/* Edit chip — author only. (Status spoofing blocked by
                        the DB trigger; status changes still go through the
                        adviser-only moderation policy.) */}
                    {isAuthor && (
                      <Pressable
                        onPress={() => handleEdit(p)}
                        style={({ pressed }) => [styles.editChip, pressed && styles.deleteChipPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${p.title}`}
                      >
                        <Text style={styles.editChipText}>Edit</Text>
                      </Pressable>
                    )}
                    {canDelete && (
                      <Pressable
                        onPress={() => handleDelete(p.id, p.title)}
                        style={({ pressed }) => [
                          styles.deleteChip,
                          pressed && styles.deleteChipPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${p.title}`}
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

// Small coloured pill that sits ABOVE the title for non-approved posts.
// Pending = neutral/warning; Rejected = danger. Approved posts don't need
// a badge (they're the default state).
function StatusBadge({ status }: { status: AnnouncementStatus }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const label = status === 'pending' ? 'Pending Review' : 'Rejected'
  const wrapStyle = status === 'pending' ? styles.statusPillPending : styles.statusPillRejected
  const textStyle = status === 'pending' ? styles.statusPillTextPending : styles.statusPillTextRejected
  return (
    <View style={[styles.statusPill, wrapStyle]}>
      <Text style={[styles.statusPillText, textStyle]}>{label}</Text>
    </View>
  )
}

// Compact relative-ish formatter: today/yesterday for recent posts, full
// month + day + year for older ones. Keeps the timeline readable.
const formatDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
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
    searchInput: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      fontSize: t.font.size.body,
      color: t.color.text,
      marginBottom: t.space.lg,
    },
    cardLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.md,
    },
    // Inline hint under the composer label — tells student submitters the
    // post needs adviser approval before others can see it.
    helperText: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginBottom: t.space.md,
    },
    // Multi-line message field — taller minHeight than the default Input.
    contentInput: {
      minHeight: 90,
      textAlignVertical: 'top',
    },
    postCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    postTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.sm,
    },
    postContent: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
      marginBottom: t.space.md,
    },
    postFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: t.space.sm,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    postMeta: {
      flex: 1,
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
    // Container for the chip cluster in the post footer — keeps delete /
    // approve / reject buttons grouped on the right side.
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
    // Edit chip — neutral/brand tone to differentiate from destructive Delete.
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
    deleteChipPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    deleteChipText: {
      fontSize: t.font.size.caption,
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
    },
    // Approve chip — green theme, matches success colour.
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
    // Reject chip — same shape as delete but uses warning tone to distinguish
    // from "delete entirely" (rejected posts are kept for the author to see).
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
    // Status pill that sits above the title for non-approved rows.
    statusPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
      borderRadius: t.radius.pill,
      marginBottom: t.space.sm,
    },
    statusPillPending: {
      backgroundColor: t.color.warningSubtle,
    },
    statusPillRejected: {
      backgroundColor: t.color.dangerSubtle,
    },
    statusPillText: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    statusPillTextPending: {
      color: t.color.warning,
    },
    statusPillTextRejected: {
      color: t.color.danger,
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
