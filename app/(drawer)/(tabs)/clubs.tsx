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
import { listClubs } from '@/services/clubs.service'
import { Organization } from '@/types'
import { Image } from 'expo-image'
import { router } from 'expo-router'
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
  const { profile } = useAuth()

  const [clubs, setClubs] = useState<Organization[]>([])
  const [query, setQuery] = useState('') // search box text
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Advisers / faculty coordinators can create clubs (matches RLS).
  const canCreate =
    profile?.role === 'adviser' || profile?.role === 'faculty_coordinator'

  // Single fetcher reused for first-load and pull-to-refresh.
  const load = useCallback(async () => {
    const { data, error } = await listClubs()
    if (error) setError(error)
    else {
      setClubs(data ?? [])
      setError(null)
    }
  }, [])

  // Initial load: show the full-screen spinner.
  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Pull-to-refresh: keep the list visible; only toggle the small spinner.
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Client-side filter — case-insensitive match against name + description.
  // Recomputed only when the list or query changes.
  const filteredClubs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clubs
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
    )
  }, [clubs, query])

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
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}`}
          onPress={() => router.push(`/club/${item.id}` as never)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          {/* Cover thumbnail — only rendered when the club has an image, so
              text-only clubs keep a compact card. */}
          {item.image_url && (
            <Image
              source={{ uri: item.image_url }}
              style={styles.cardImage}
              contentFit="cover"
              transition={150}
            />
          )}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            {/* Trim long descriptions to keep cards uniform; full text lives on the detail screen. */}
            <Text style={styles.cardDesc} numberOfLines={2}>
              {item.description || 'No description provided.'}
            </Text>
            <Text style={styles.cardMeta}>
              {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </Pressable>
      )}
    />
  )
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
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      // Padding moved to cardBody so the cover image can sit flush to the
      // card edges. overflow:hidden clips the image to the rounded corners.
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      overflow: 'hidden',
      ...t.shadow.card,
    },
    // Cover thumbnail at the top of a card (16:9), flush to the edges.
    cardImage: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: t.color.surfaceMuted,
    },
    // Holds the text content; carries the padding the card used to have.
    cardBody: {
      padding: t.space.lg,
    },
    cardPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    cardTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    cardDesc: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      color: t.color.textMuted,
      marginBottom: t.space.sm,
    },
    cardMeta: {
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      color: t.color.textSubtle,
      fontWeight: t.font.weight.medium,
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
