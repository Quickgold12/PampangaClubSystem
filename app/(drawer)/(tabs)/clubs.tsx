// ─────────────────────────────────────────────────────────────────────────────
// Clubs tab — browse every organization on campus.
//
// What this screen does:
//   • Loads the full list of clubs from clubs.service.ts on mount.
//   • Search box filters the list by name/description as you type (client-side
//     — the full list is small enough that we don't round-trip per keystroke).
//   • Advisers / faculty coordinators get a "+ Create Club" button.
//   • Pull-to-refresh re-fetches.
//   • Tapping a card pushes /club/[id] for the full detail view.
//
// Visible to every signed-in user regardless of role — discovery is universal.
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { countUnreadByClubForUser } from '@/services/chat.service'
import { listClubs, listMyMembershipMap } from '@/services/clubs.service'
import { Organization } from '@/types'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export default function ClubsScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user, profile } = useAuth()

  const [clubs, setClubs] = useState<Organization[]>([])
  // Map<organization_id, 'officer' | 'member'> — drives the membership badge
  // on each card so the user can tell at a glance which clubs they belong to.
  const [membershipMap, setMembershipMap] = useState<Map<string, 'officer' | 'member'>>(new Map())
  // Map<organization_id, count> — number of new chat messages per club since
  // the user's last_read_messages_at. Drives the red "+N" notification badge.
  const [unreadMap, setUnreadMap] = useState<Map<string, number>>(new Map())
  const [query, setQuery] = useState('') // search box text
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Advisers / faculty coordinators can create clubs (matches RLS).
  const canCreate =
    profile?.role === 'adviser' || profile?.role === 'faculty_coordinator'

  // Single fetcher reused for first-load and pull-to-refresh. Pulls clubs +
  // the user's membership map in parallel so the badge data is ready before
  // first render.
  const load = useCallback(async () => {
    const [clubsRes, mapRes, unreadRes] = await Promise.all([
      listClubs(),
      user ? listMyMembershipMap(user.id) : Promise.resolve({ data: new Map(), error: null }),
      user
        ? countUnreadByClubForUser(user.id)
        : Promise.resolve({ data: new Map<string, number>(), error: null }),
    ])
    if (clubsRes.error) setError(clubsRes.error)
    else {
      setClubs(clubsRes.data ?? [])
      setError(null)
    }
    if (mapRes.data) setMembershipMap(mapRes.data)
    if (unreadRes.data) setUnreadMap(unreadRes.data)
  }, [user])

  // Initial load: show the full-screen spinner.
  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Re-fetch the unread map whenever this screen regains focus (e.g. after the
  // user opens a club's chat and comes back). markChatRead in the chat screen
  // bumps the timestamp; refocusing here picks up the cleared count without a
  // pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (!user) return
      countUnreadByClubForUser(user.id).then((res) => {
        if (res.data) setUnreadMap(res.data)
      })
    }, [user])
  )

  // Pull-to-refresh: keep the list visible; only toggle the small spinner.
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Client-side filter — case-insensitive match against name + description.
  // Then SORT so the user's most-relevant clubs float to the top:
  //   0 — Adviser / faculty coordinator of this club (named on the org row)
  //   1 — Officer membership
  //   2 — Regular membership
  //   3 — Not affiliated
  // Ties broken alphabetically by name. With 28+ clubs in the list this means
  // an adviser sees their own club first without scrolling or searching.
  const filteredClubs = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = !q
      ? clubs
      : clubs.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q)
        )

    const priority = (c: Organization): number => {
      if (!user) return 3
      if (c.adviser_id === user.id || c.faculty_coordinator_id === user.id) return 0
      const role = membershipMap.get(c.id)
      if (role === 'officer') return 1
      if (role === 'member') return 2
      return 3
    }

    // Note: slice() first so we don't mutate the original `clubs` array.
    return matched.slice().sort((a, b) => {
      const pa = priority(a)
      const pb = priority(b)
      if (pa !== pb) return pa - pb
      return a.name.localeCompare(b.name)
    })
  }, [clubs, query, user, membershipMap])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  return (
    <FlatList
      data={filteredClubs}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      // Header carries the title, create button, search box, and error banner so
      // they all scroll with the list.
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Pampanga High School</Text>
          <Text style={styles.title}>Clubs</Text>
          <Text style={styles.subtitle}>Browse and request to join</Text>

          {/* Create button — advisers/faculty only. */}
          {canCreate && (
            <Pressable
              onPress={() => router.push('/club/create' as never)}
              style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Create a new club"
            >
              <Text style={styles.createButtonText}>+ Create Club</Text>
            </Pressable>
          )}

          {/* Search box — filters the list below as you type. */}
          <TextInput
            style={styles.searchInput}
            placeholder="Search clubs…"
            placeholderTextColor={theme.color.textSubtle}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search clubs"
          />

          {error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          {/* Different copy depending on whether the list is empty because of
              the search filter or because there are genuinely no clubs. */}
          <Text style={styles.emptyText}>
            {query.trim()
              ? `No clubs match "${query.trim()}".`
              : 'No clubs available yet.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        // Determine the user's relationship to THIS club, ordered most-
        // privileged to least so we show the strongest applicable badge.
        const badge = membershipBadgeFor(item, user?.id, membershipMap)
        const unread = unreadMap.get(item.id) ?? 0
        // Facebook-style cap: anything past 9 renders as "9+" so the badge
        // doesn't grow wider than its parent row.
        const unreadLabel = unread > 9 ? '9+' : String(unread)
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              `Open ${item.name}${badge ? `, ${badge.label}` : ''}` +
              (unread > 0 ? `, ${unread} new message${unread === 1 ? '' : 's'}` : '')
            }
            onPress={() => router.push(`/club/${item.id}` as never)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            {/* Cover thumbnail — only rendered when the club has an image. */}
            {item.image_url && (
              <Image
                source={{ uri: item.image_url }}
                style={styles.cardImage}
                contentFit="cover"
                transition={150}
              />
            )}
            {/* Floating notification badge — top-right of the card. Anchored
                outside the body so it sits in front of the cover image too
                (matches how Facebook draws the red badge over an icon). */}
            {unread > 0 && (
              <View style={styles.notifBadge} pointerEvents="none">
                <Text style={styles.notifBadgeText}>{unreadLabel}</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              {/* Title row: club name on the left, membership badge on the
                  right when applicable. Lets the user spot "their" clubs at
                  a glance while scrolling 28+ entries. */}
              <View style={styles.titleRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                {badge && (
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardDesc} numberOfLines={2}>
                {item.description || 'No description provided.'}
              </Text>
              <Text style={styles.cardMeta}>
                {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
              </Text>
            </View>
          </Pressable>
        )
      }}
    />
  )
}

// Resolves the strongest membership badge for a (club, user) pair.
// Priority: Adviser/Faculty Coordinator (named directly on the org) →
// Officer (officer membership row) → Member (any membership row) → none.
// Each badge carries its own colour palette so the visual hierarchy reads
// without reading the label.
type BadgeStyle = { label: string; bg: string; fg: string; border: string }
function membershipBadgeFor(
  club: Organization,
  userId: string | undefined,
  map: Map<string, 'officer' | 'member'>
): BadgeStyle | null {
  if (!userId) return null
  // Lazy theme access — we resolve final colours at render-time via inline
  // useTheme lookup. The colours below are tokens copied from `tokens.ts`
  // for the light palette (matches the rest of the screen).
  if (club.adviser_id === userId || club.faculty_coordinator_id === userId) {
    return { label: 'Adviser', bg: '#FFF4D6', fg: '#D97706', border: '#F59E0B' }
  }
  const role = map.get(club.id)
  if (role === 'officer') return { label: 'Officer', bg: '#DCFCE7', fg: '#15803D', border: '#15803D' }
  if (role === 'member') return { label: 'Member', bg: '#F5F0E6', fg: '#525252', border: '#A3A3A3' }
  return null
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
      // hierarchy. Eyebrow already carries the brand color.
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
      marginBottom: t.space.md,
    },
    // Full-width brand button to open the create-club form.
    createButton: {
      backgroundColor: t.color.brand,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
      marginBottom: t.space.md,
    },
    createButtonPressed: {
      backgroundColor: t.color.brandPressed,
    },
    createButtonText: {
      color: t.color.onBrand,
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
    },
    // Search box styled like a single-line Input (we don't reuse the Input
    // component here because it forces a visible label, which the search box
    // doesn't need).
    searchInput: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      fontSize: t.font.size.body,
      color: t.color.text,
      minHeight: t.touchTarget,
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
    // Roomier card style — more vertical separation + interior padding so
    // 28+ clubs don't feel like a wall of text. Easier to scan and tap.
    // `position: relative` anchors the floating notification badge.
    card: {
      position: 'relative',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      marginBottom: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      overflow: 'hidden',
      ...t.shadow.card,
    },
    // Facebook-style notification badge — red pill with white number, pinned
    // to the top-right corner of the card. zIndex keeps it above the cover
    // image; the card's overflow:hidden + borderRadius keeps it inside the
    // rounded corners.
    notifBadge: {
      position: 'absolute',
      top: t.space.sm,
      right: t.space.sm,
      zIndex: 2,
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      paddingHorizontal: 6,
      backgroundColor: t.color.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.color.surface,
    },
    notifBadgeText: {
      color: '#FFFFFF',
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      fontWeight: t.font.weight.bold,
    },
    cardImage: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: t.color.surfaceMuted,
    },
    cardBody: {
      padding: t.space.xl,
    },
    cardPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    // Title + badge live on the same row; badge sits at the top-right corner.
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: t.space.md,
      marginBottom: t.space.sm,
    },
    cardTitle: {
      flex: 1,
      fontSize: t.font.size.h3,
      lineHeight: t.font.lineHeight.h3,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    cardDesc: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
      marginBottom: t.space.md,
    },
    cardMeta: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      color: t.color.textSubtle,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    // Membership badge — pill in the top-right of each card. Colour mapping
    // is in membershipBadgeFor() above.
    badge: {
      paddingHorizontal: t.space.sm,
      paddingVertical: 4,
      borderRadius: t.radius.pill,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.bold,
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
    },
  })
