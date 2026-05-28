// ─────────────────────────────────────────────────────────────────────────────
// Create Club screen — adviser / faculty coordinator only.
//
// What this screen does:
//   • Collects a club name + description.
//   • Calls createClub(), which records the signed-in user as the club's
//     adviser (or faculty coordinator, matching their app-wide role).
//   • On success, replaces the route with the new club's detail page so the
//     creator lands straight on the club they just made.
//
// Access: a student who somehow reaches this screen is blocked twice — the
// client guard below shows a message, and RLS rejects the insert anyway.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { createClub } from '@/services/clubs.service'
import { sanitizeText } from '@/utils/sanitize'
import { router, Stack } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function CreateClubScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user, profile } = useAuth()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Only advisers / faculty coordinators may create clubs.
  const canCreate =
    profile?.role === 'adviser' || profile?.role === 'faculty_coordinator'

  const handleCreate = async () => {
    if (!user || !profile) return
    const cleanName = sanitizeText(name)
    const cleanDescription = sanitizeText(description)
    if (cleanName.length < 2) {
      Alert.alert('Missing name', 'Please give the club a name.')
      return
    }

    setSaving(true)
    const { data, error } = await createClub({
      name: cleanName,
      description: cleanDescription,
      creatorId: user.id,
      creatorRole: profile.role,
    })
    setSaving(false)

    if (error) {
      Alert.alert('Could not create club', error)
      return
    }
    // Land the creator directly on their new club. `replace` so Back returns
    // to the Clubs list, not this now-empty form.
    if (data) {
      router.replace(`/club/${data.id}` as never)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Create Club', headerShown: true }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>New Organization</Text>
            <Text style={styles.title}>Create a Club</Text>
            <Text style={styles.subtitle}>
              You&apos;ll be set as the club&apos;s {profile?.role === 'adviser' ? 'adviser' : 'faculty coordinator'}.
            </Text>
          </View>

          {/* Non-eligible roles get a clear message instead of a dead form. */}
          {!canCreate ? (
            <View style={styles.card}>
              <Text style={styles.bodyMuted}>
                Only advisers and faculty coordinators can create clubs.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Input
                label="Club Name"
                placeholder="Computer Club"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!saving}
              />
              <Input
                label="Description"
                placeholder="What is this club about? When does it meet?"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                editable={!saving}
                style={styles.descriptionInput}
              />
              <Button label="Create Club" onPress={handleCreate} loading={saving} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.color.background,
    },
    scroll: {
      flexGrow: 1,
      padding: t.space.xl,
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
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    descriptionInput: {
      minHeight: 110,
      textAlignVertical: 'top',
    },
    bodyMuted: {
      fontSize: t.font.size.body,
      color: t.color.textMuted,
    },
  })
