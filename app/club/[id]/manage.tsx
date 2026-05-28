// ─────────────────────────────────────────────────────────────────────────────
// Manage Members screen — officer/adviser-only.
//
// What this screen does:
//   • Lists every current member of the club with their in-club role.
//   • Add Member by email: officer types an existing user's email and the row
//     is created via addMemberByEmail() in membership.service.ts.
//   • Per-row actions:
//       • Promote → set role_in_club='officer'  (or)  Demote → 'member'
//       • Remove  → delete the membership row.
//   • All writes go through services that respect RLS; if the caller isn't
//     actually allowed to write, the service returns a Postgres permission
//     error which we surface in an Alert.
//
// Note on the current user: we hide the "Remove" action on their own row so
// they can't accidentally kick themselves out (which would also strip their
// officer access and prevent recovery without another officer's help).
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { getClubDetail } from '@/services/clubs.service'
import {
  addMemberByEmail,
  removeMember,
  setMemberRole,
} from '@/services/membership.service'
import { ClubDetail } from '@/types'
import { sanitizeEmail } from '@/utils/sanitize'
import { validateEmail } from '@/utils/validation'
import { Stack, useLocalSearchParams } from 'expo-router'
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

export default function ManageMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)

  // Refetch the full club blob whenever a write succeeds — simple and keeps
  // state authoritative without manual list patching.
  const load = useCallback(async () => {
    if (!id) return
    const { data } = await getClubDetail(id)
    if (data) setClub(data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const handleAdd = async () => {
    if (!id) return
    const clean = sanitizeEmail(addEmail)
    const emailError = validateEmail(clean)
    if (emailError) {
      Alert.alert('Invalid email', emailError)
      return
    }
    setAdding(true)
    const { error } = await addMemberByEmail(id, clean)
    setAdding(false)
    if (error) {
      Alert.alert('Could not add member', error)
      return
    }
    setAddEmail('')
    await load()
  }

  const handleRemove = (memberId: string, name: string) => {
    if (!id) return
    Alert.alert('Remove member?', `${name} will lose access to this club.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await removeMember(id, memberId)
          if (error) Alert.alert('Remove failed', error)
          await load()
        },
      },
    ])
  }

  const handleToggleRole = async (
    memberId: string,
    currentRole: 'member' | 'officer'
  ) => {
    if (!id) return
    const next = currentRole === 'officer' ? 'member' : 'officer'
    const { error } = await setMemberRole(id, memberId, next)
    if (error) {
      Alert.alert('Update failed', error)
      return
    }
    await load()
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
      <Stack.Screen options={{ title: 'Manage Members', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>Members</Text>
          <Text style={styles.subtitle}>
            {club.members.length} {club.members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>

        {/* Add-by-email card. Keeping it at the top so the action the user
            came here for is one tap away. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Add Member</Text>
          <Input
            label="Email Address"
            placeholder="member@school.edu"
            value={addEmail}
            onChangeText={setAddEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!adding}
          />
          <Button label="Add Member" onPress={handleAdd} loading={adding} />
        </View>

        {/* Member list with inline role-toggle and remove actions. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current Members</Text>
          {club.members.length === 0 ? (
            <Text style={styles.bodyMuted}>No members yet.</Text>
          ) : (
            club.members.map((m) => {
              const isMe = m.id === user?.id
              return (
                <View key={m.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{m.full_name}</Text>
                    <Text style={styles.rowRole}>
                      {m.role_in_club === 'officer' ? 'Officer' : 'Member'}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    {/* Promote/demote toggle. Label flips based on current role. */}
                    <Pressable
                      onPress={() => handleToggleRole(m.id, m.role_in_club)}
                      style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.actionChipText}>
                        {m.role_in_club === 'officer' ? 'Demote' : 'Promote'}
                      </Text>
                    </Pressable>
                    {/* Self-removal is blocked — see comment at top of file. */}
                    {!isMe && (
                      <Pressable
                        onPress={() => handleRemove(m.id, m.full_name)}
                        style={({ pressed }) => [styles.removeChip, pressed && styles.removeChipPressed]}
                        accessibilityRole="button"
                      >
                        <Text style={styles.removeChipText}>Remove</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>
    </>
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
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
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
      marginBottom: t.space.md,
    },
    bodyMuted: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    row: {
      paddingVertical: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    rowMain: {
      marginBottom: t.space.sm,
    },
    rowName: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
    },
    rowRole: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
    rowActions: {
      flexDirection: 'row',
      gap: t.space.sm,
    },
    actionChip: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.brandSubtle,
      borderWidth: 1,
      borderColor: t.color.brand,
    },
    actionChipPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    actionChipText: {
      fontSize: t.font.size.caption,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    removeChip: {
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.sm,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.dangerSubtle,
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    removeChipPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    removeChipText: {
      fontSize: t.font.size.caption,
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
    },
  })
