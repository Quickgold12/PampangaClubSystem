// ─────────────────────────────────────────────────────────────────────────────
// Public profile — view another member.
//
// Reached by tapping a member's name in a club's Members list or a chat
// author. Shows their avatar, name, app role, and the clubs they belong to
// (with their in-club role). No email — a public profile shouldn't leak it.
//
// Everything here is readable under RLS: users, memberships, and organizations
// are all selectable by any authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import { fetchPublicProfile, PublicProfile } from '@/services/auth.service'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetchPublicProfile(id)
      .then(setProfile)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  if (!profile) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profile', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>This member could not be found.</Text>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: profile.full_name, headerShown: true }} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Identity block: avatar + name + role. */}
        <View style={styles.identity}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {profile.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{profile.full_name}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{formatRole(profile.role)}</Text>
          </View>
        </View>

        {/* Clubs this member belongs to. */}
        <Text style={styles.sectionLabel}>Clubs</Text>
        {profile.clubs.length === 0 ? (
          <Text style={styles.bodyMuted}>Not a member of any club yet.</Text>
        ) : (
          profile.clubs.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/club/${c.id}` as never)}
              style={({ pressed }) => [styles.clubRow, pressed && styles.clubRowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${c.name}`}
            >
              <Text style={styles.clubName} numberOfLines={1}>
                {c.name}
              </Text>
              {c.role_in_club === 'officer' && (
                <View style={styles.officerPill}>
                  <Text style={styles.officerPillText}>Officer</Text>
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  )
}

const formatRole = (role: string): string => {
  const map: Record<string, string> = {
    student_member: 'Student Member',
    club_officer: 'Club Officer',
    adviser: 'Club Adviser',
    faculty_coordinator: 'Faculty Coordinator',
  }
  return map[role] ?? role
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
    identity: {
      alignItems: 'center',
      marginBottom: t.space.xl,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: t.color.surfaceMuted,
      marginBottom: t.space.md,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.color.brandSubtle,
    },
    avatarInitial: {
      fontSize: t.font.size.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    name: {
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      textAlign: 'center',
      marginBottom: t.space.sm,
    },
    rolePill: {
      backgroundColor: t.color.brandSubtle,
      paddingHorizontal: t.space.md,
      paddingVertical: 4,
      borderRadius: t.radius.pill,
    },
    rolePillText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    sectionLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    bodyMuted: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    clubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.sm,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      marginBottom: t.space.sm,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    clubRowPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    clubName: {
      flex: 1,
      fontSize: t.font.size.body,
      color: t.color.text,
    },
    officerPill: {
      backgroundColor: t.color.brandSubtle,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
    },
    officerPillText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
    },
  })
