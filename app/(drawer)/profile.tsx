// ─────────────────────────────────────────────────────────────────────────────
// Profile screen — accessible from the drawer.
//
// What this screen does:
//   • Shows an avatar (uploaded photo, or initials placeholder) with a
//     "Change Photo" button — pick → upload → save avatar_url.
//   • Shows the signed-in user's email + role (both read-only).
//   • Lets the user edit their full name and save it.
//   • Lets the user change their password (verifies the current one first).
//   • After any change, calls refreshProfile() so the new name/photo show up
//     everywhere (drawer footer, dashboard greeting, etc).
//
// Email is read-only (changing it needs a Supabase Auth re-confirmation flow).
// Role is read-only (admin-only change).
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { changePassword, updateProfile } from '@/services/auth.service'
import { pickImage, uploadAvatar } from '@/services/storage.service'
import { sanitizeText } from '@/utils/sanitize'
import { toastSuccess } from '@/utils/toast'
import { validateFullName, validatePassword, validatePasswordMatch } from '@/utils/validation'
import { Image } from 'expo-image'
import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

export default function ProfileScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user, profile, refreshProfile } = useAuth()

  // ── Name edit state ──────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [savingName, setSavingName] = useState(false)

  // ── Avatar upload state ──────────────────────────────────────────────────
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // ── Change-password state ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // Keep the name field in sync if the profile reloads.
  useEffect(() => {
    setFullName(profile?.full_name ?? '')
  }, [profile?.full_name])

  // "Dirty" = the name differs from the saved profile (disables Save otherwise).
  const isNameDirty = sanitizeText(fullName) !== (profile?.full_name ?? '')

  // ── Save name ────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    if (!user) return
    const clean = sanitizeText(fullName)
    const nameError = validateFullName(clean)
    if (nameError) {
      Alert.alert('Invalid name', nameError)
      return
    }

    setSavingName(true)
    const { error } = await updateProfile(user.id, { full_name: clean })
    setSavingName(false)

    if (error) {
      Alert.alert('Could not save', error)
      return
    }
    await refreshProfile()
    toastSuccess('Name updated')
  }

  // ── Change photo (pick → upload → persist URL) ──────────────────────────
  const handleChangePhoto = async () => {
    if (!user) return
    // Square crop for avatars.
    const picked = await pickImage([1, 1])
    if (picked.error) {
      Alert.alert('Could not open library', picked.error)
      return
    }
    if (!picked.data) return // cancelled

    setUploadingPhoto(true)
    const uploaded = await uploadAvatar(user.id, picked.data)
    if (uploaded.error || !uploaded.data) {
      setUploadingPhoto(false)
      Alert.alert('Upload failed', uploaded.error ?? 'Please try again.')
      return
    }
    const saved = await updateProfile(user.id, { avatar_url: uploaded.data.publicUrl })
    setUploadingPhoto(false)
    if (saved.error) {
      Alert.alert('Could not save photo', saved.error)
      return
    }
    await refreshProfile() // propagates the new photo to the drawer etc.
  }

  // ── Change password ──────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!profile) return
    if (!currentPassword) {
      Alert.alert('Missing current password', 'Enter your current password first.')
      return
    }
    const passError = validatePassword(newPassword)
    if (passError) {
      Alert.alert('Invalid new password', passError)
      return
    }
    const matchError = validatePasswordMatch(newPassword, confirmPassword)
    if (matchError) {
      Alert.alert('Passwords do not match', matchError)
      return
    }

    setChangingPassword(true)
    const result = await changePassword(profile.email, currentPassword, newPassword)
    setChangingPassword(false)

    if (!result.success) {
      Alert.alert('Could not change password', result.error ?? 'Please try again.')
      return
    }
    // Clear the fields so the form resets.
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toastSuccess('Password changed')
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.bodyMuted}>Loading profile…</Text>
      </View>
    )
  }

  // Initials shown when there's no avatar photo (e.g. "Elijah Gonzales" → "EG").
  const initials = profile.full_name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.title}>Profile</Text>
      </View>

      {/* Avatar + change photo. */}
      <View style={styles.avatarCard}>
        <View style={styles.avatarWrap}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitials}>{initials || '?'}</Text>
            </View>
          )}
          {uploadingPhoto && (
            // Spinner overlay while the upload is in flight.
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color={theme.color.onBrand} />
            </View>
          )}
        </View>
        <Pressable
          onPress={handleChangePhoto}
          disabled={uploadingPhoto}
          style={({ pressed }) => [styles.photoButton, pressed && styles.photoButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          <Text style={styles.photoButtonText}>
            {profile.avatar_url ? 'Change Photo' : 'Add Photo'}
          </Text>
        </Pressable>
      </View>

      {/* Read-only identity card. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Signed in as</Text>
        <Text style={styles.cardValue}>{profile.email}</Text>
        <Text style={styles.cardMeta}>{formatRole(profile.role)}</Text>
      </View>

      {/* Editable name. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Edit Name</Text>
        <Input
          label="Full Name"
          placeholder="Your full name"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          editable={!savingName}
        />
        <Button
          label="Save Name"
          onPress={handleSaveName}
          loading={savingName}
          disabled={!isNameDirty}
        />
      </View>

      {/* Change password. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Change Password</Text>
        <Input
          label="Current Password"
          placeholder="Your current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          isPassword
          editable={!changingPassword}
        />
        <Input
          label="New Password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          isPassword
          editable={!changingPassword}
        />
        <Input
          label="Confirm New Password"
          placeholder="Re-enter the new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          isPassword
          editable={!changingPassword}
        />
        <Button
          label="Update Password"
          onPress={handleChangePassword}
          loading={changingPassword}
        />
      </View>
    </ScrollView>
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
    header: {
      marginBottom: t.space.lg,
    },
    eyebrow: {
      fontSize: t.font.size.caption,
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
    // ── Avatar card ───────────────────────────────────────────────────────
    avatarCard: {
      alignItems: 'center',
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    avatarWrap: {
      position: 'relative',
      marginBottom: t.space.md,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: t.radius.pill, // circular
      backgroundColor: t.color.surfaceMuted,
    },
    avatarPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: t.color.brand,
    },
    avatarInitials: {
      fontSize: t.font.size.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    // Dim overlay + spinner shown while uploading.
    avatarOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: t.radius.pill,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoButton: {
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.sm,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.brand,
      backgroundColor: t.color.brandSubtle,
    },
    photoButtonPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    photoButtonText: {
      color: t.color.brandPressed,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    cardLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    cardValue: {
      fontSize: t.font.size.body,
      color: t.color.text,
      fontWeight: t.font.weight.semibold,
    },
    cardMeta: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
      marginTop: t.space.xs,
    },
    bodyMuted: {
      color: t.color.textMuted,
      fontSize: t.font.size.body,
    },
  })
