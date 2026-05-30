// ─────────────────────────────────────────────────────────────────────────────
// Club detail screen — pushed when the user taps a card on the Clubs tab.
//
// What this screen does:
//   • Reads the :id route param and fetches the club's full detail blob
//     (description + adviser + member list) via getClubDetail().
//   • Shows a header with the club name, description, and adviser.
//   • Lists every current member with their in-club role (member vs officer).
//   • Footer button (role-dependent):
//       - Students who aren't members yet see "Request to Join".
//       - Already-members see a confirmation chip.
//   • Officer/adviser action row at the top of the footer:
//       - "Manage Members"        → /club/[id]/manage
//       - "Attendance"            → /club/[id]/attendance
//       - "Record Attendance"     → /club/[id]/record-attendance
//
// "Is officer/adviser FOR THIS CLUB?" is computed locally from the fetched
// detail (membership row OR adviser_id/faculty_coordinator_id match) — we
// never trust the app-wide profile.role alone, because a student officer of
// Club A is just a regular student to Club B.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { getClubDetail, requestToJoin, updateClub } from '@/services/clubs.service'
import { pickImage, uploadClubImage } from '@/services/storage.service'
import { ClubDetail } from '@/types'
import { toastSuccess } from '@/utils/toast'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user, profile } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [requested, setRequested] = useState(false) // local flag: hides the join button after submit
  const [uploadingCover, setUploadingCover] = useState(false) // cover image upload in progress
  const [error, setError] = useState<string | null>(null)

  // Pull the club blob; re-runs only if the route id changes.
  const load = useCallback(async () => {
    if (!id) return
    const { data, error } = await getClubDetail(id)
    if (error) setError(error)
    else setClub(data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // ── Derived flags (computed once per render) ────────────────────────────
  const isStudent = profile?.role === 'student_member' || profile?.role === 'club_officer'
  const isAlreadyMember = !!club?.members.some((m) => m.id === user?.id)
  // Officer-for-this-club: officer membership row OR named on the org as
  // adviser / faculty coordinator. Faculty coordinators get the same buttons
  // as advisers for now.
  const isReviewerForThisClub =
    !!user &&
    !!club &&
    (user.id === club.adviser_id ||
      user.id === club.faculty_coordinator_id ||
      club.members.some((m) => m.id === user.id && m.role_in_club === 'officer'))
  // Cover-image editing is adviser/faculty-only — they're the only roles whose
  // updateClub call passes the organizations UPDATE RLS policy.
  const isAdviserForThisClub =
    !!user &&
    !!club &&
    (user.id === club.adviser_id || user.id === club.faculty_coordinator_id)

  const handleJoin = async () => {
    if (!user || !club) return
    setSubmitting(true)
    const { error } = await requestToJoin(user.id, club.id)
    setSubmitting(false)

    if (error) {
      Alert.alert('Unable to send request', error)
      return
    }
    setRequested(true)
    toastSuccess('Request sent', 'An officer or adviser will review it soon.')
  }

  // Pick → upload → persist the cover image URL on the club. Three steps, each
  // can fail independently; we surface the first failure and stop.
  const handleChangeCover = async () => {
    if (!club) return

    // 1. Pick. null = user cancelled (no-op, no error).
    const picked = await pickImage()
    if (picked.error) {
      Alert.alert('Could not open library', picked.error)
      return
    }
    if (!picked.data) return // cancelled

    setUploadingCover(true)
    // 2. Upload bytes to storage.
    const uploaded = await uploadClubImage(club.id, picked.data)
    if (uploaded.error || !uploaded.data) {
      setUploadingCover(false)
      Alert.alert('Upload failed', uploaded.error ?? 'Please try again.')
      return
    }
    // 3. Save the public URL onto the club row (RLS: adviser/faculty only).
    const saved = await updateClub(club.id, { image_url: uploaded.data.publicUrl })
    setUploadingCover(false)
    if (saved.error) {
      Alert.alert('Could not save cover', saved.error)
      return
    }
    // Reflect the new cover immediately without a full refetch.
    setClub({ ...club, image_url: uploaded.data.publicUrl })
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }

  if (error || !club) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{error ?? 'Club not found.'}</Text>
      </View>
    )
  }

  return (
    <>
      {/* Stack header title is set dynamically so the back-stack reads "← <Club name>". */}
      <Stack.Screen options={{ title: club.name, headerShown: true }} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Cover banner. Shows the uploaded image if present, otherwise a
            placeholder. Advisers get a tappable "Change/Add Cover" overlay. */}
        <View style={styles.coverWrap}>
          {club.image_url ? (
            <Image
              source={{ uri: club.image_url }}
              style={styles.coverImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <Text style={styles.coverPlaceholderText}>No cover image</Text>
            </View>
          )}
          {isAdviserForThisClub && (
            <Pressable
              onPress={handleChangeCover}
              disabled={uploadingCover}
              style={({ pressed }) => [styles.coverButton, pressed && styles.coverButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel={club.image_url ? 'Change cover image' : 'Add cover image'}
            >
              {uploadingCover ? (
                <ActivityIndicator color={theme.color.onBrand} size="small" />
              ) : (
                <Text style={styles.coverButtonText}>
                  {club.image_url ? 'Change Cover' : 'Add Cover'}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>Club</Text>
          <Text style={styles.title}>{club.name}</Text>
          <Text style={styles.memberCount}>
            {club.member_count} {club.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>

        <Section title="About">
          <Text style={styles.body}>{club.description || 'No description provided.'}</Text>
        </Section>

        <Section title="Adviser">
          <Text style={styles.body}>
            {club.adviser?.full_name ?? 'No adviser assigned yet.'}
          </Text>
        </Section>

        <Section title="Members">
          {club.members.length === 0 ? (
            <Text style={styles.bodyMuted}>No members yet — be the first to join.</Text>
          ) : (
            club.members.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/profile/${m.id}` as never)}
                style={({ pressed }) => [styles.memberRow, pressed && styles.memberRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`View ${m.full_name}'s profile`}
              >
                <Text style={styles.memberName}>{m.full_name}</Text>
                {m.role_in_club === 'officer' && (
                  <View style={styles.officerPill}>
                    <Text style={styles.officerPillText}>Officer</Text>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </Section>

        {/* Member-visible action row — Announcements + Finances + Reports +
            Events. Read-only for regular members; editable for officers /
            advisers. (Chat lives in its own tab now — separate, more visible
            entry point matching the Messenger pattern users expect.) */}
        {(isAlreadyMember || isReviewerForThisClub) && (
          <View style={styles.actionGrid}>
            <ActionButton
              label="Announcements"
              onPress={() => router.push(`/club/${club.id}/announcements` as never)}
            />
            <ActionButton
              label="Finances"
              onPress={() => router.push(`/club/${club.id}/finances` as never)}
            />
            <ActionButton
              label="Reports"
              onPress={() => router.push(`/club/${club.id}/reports` as never)}
            />
            <ActionButton
              label="Events"
              onPress={() => router.push(`/club/${club.id}/events` as never)}
            />
            {/* Members check in to events by scanning the officer's QR. */}
            <ActionButton label="Scan to Check In" onPress={() => router.push('/scan' as never)} />
          </View>
        )}

        {/* Officer/adviser-only action bar — three navigation buttons. */}
        {isReviewerForThisClub && (
          <View style={styles.actionGrid}>
            <ActionButton
              label="Manage Members"
              onPress={() => router.push(`/club/${club.id}/manage` as never)}
            />
            <ActionButton
              label="Attendance"
              onPress={() => router.push(`/club/${club.id}/attendance` as never)}
            />
            <ActionButton
              label="Record Attendance"
              onPress={() => router.push(`/club/${club.id}/record-attendance` as never)}
            />
            {/* Open a QR session members scan to mark themselves present. */}
            <ActionButton
              label="QR Check-In"
              onPress={() => router.push(`/club/${club.id}/checkin` as never)}
            />
            {/* Visual attendance + membership insights (officer/adviser only). */}
            <ActionButton
              label="Analytics"
              onPress={() => router.push(`/club/${club.id}/analytics` as never)}
            />
          </View>
        )}

        {/* Student footer — three mutually exclusive states. */}
        <View style={styles.footer}>
          {isAlreadyMember ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>You are a member</Text>
            </View>
          ) : requested ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>Request sent</Text>
            </View>
          ) : isStudent ? (
            <Button label="Request to Join" onPress={handleJoin} loading={submitting} />
          ) : !isReviewerForThisClub ? (
            <Text style={styles.bodyMuted}>Only students can request to join.</Text>
          ) : null}
        </View>
      </ScrollView>
    </>
  )
}

// Tiny labelled-section wrapper, kept here to avoid repeating the same JSX.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  )
}

// Tile-style nav button used by the officer action grid. Pressable instead of
// the brand Button so we can lay them out in a wrappable row.
function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.actionTilePressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
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
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    // ── Cover banner ──────────────────────────────────────────────────────
    coverWrap: {
      position: 'relative',
      marginBottom: t.space.lg,
      borderRadius: t.radius.lg,
      overflow: 'hidden',
    },
    coverImage: {
      width: '100%',
      aspectRatio: 16 / 9, // matches the picker's crop aspect
      backgroundColor: t.color.surfaceMuted,
    },
    coverPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverPlaceholderText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.bodySm,
    },
    // Floating action over the bottom-right of the banner.
    coverButton: {
      position: 'absolute',
      right: t.space.sm,
      bottom: t.space.sm,
      backgroundColor: t.color.brand,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverButtonPressed: {
      backgroundColor: t.color.brandPressed,
    },
    coverButtonText: {
      color: t.color.onBrand,
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
    },
    header: {
      marginBottom: t.space.xl,
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
      marginBottom: t.space.xs,
    },
    memberCount: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    section: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    sectionLabel: {
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    body: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
    },
    bodyMuted: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      color: t.color.textMuted,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.sm,
      borderRadius: t.radius.sm,
      gap: t.space.sm,
    },
    memberRowPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    memberName: {
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
    // Officer action grid — three tile buttons that wrap on narrow screens.
    actionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.sm,
      marginBottom: t.space.md,
    },
    actionTile: {
      flexGrow: 1,
      flexBasis: '45%',
      backgroundColor: t.color.brandSubtle,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.color.brand,
    },
    actionTilePressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    actionLabel: {
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
      textAlign: 'center',
    },
    footer: {
      marginTop: t.space.md,
    },
    statusPill: {
      backgroundColor: t.color.successSubtle,
      borderRadius: t.radius.md,
      padding: t.space.md,
      alignItems: 'center',
    },
    statusPillText: {
      color: t.color.success,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
    },
  })
