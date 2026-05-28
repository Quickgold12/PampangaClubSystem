// ─────────────────────────────────────────────────────────────────────────────
// Reset Password screen — step 2 of recovery.
//
// How the user gets here:
//   They tapped the reset link in their email → the app opened with a Supabase
//   "recovery" session → AuthContext detected the PASSWORD_RECOVERY event and
//   routed here (see app/_layout.tsx + AuthContext).
//
// What this screen does:
//   • Collects a new password + confirmation.
//   • Calls updatePassword(), which works because the recovery session is
//     active.
//   • On success, signs the user out of the recovery session and sends them to
//     the login screen to sign in fresh with the new password.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useTheme } from '@/hooks/use-theme'
import { signOut, updatePassword } from '@/services/auth.service'
import { validatePassword, validatePasswordMatch } from '@/utils/validation'
import { router } from 'expo-router'
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

export default function ResetPasswordScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleReset = async () => {
    // Reuse the same validators as signup for consistency.
    const passError = validatePassword(password)
    if (passError) {
      Alert.alert('Invalid password', passError)
      return
    }
    const matchError = validatePasswordMatch(password, confirm)
    if (matchError) {
      Alert.alert('Passwords do not match', matchError)
      return
    }

    setLoading(true)
    const result = await updatePassword(password)
    setLoading(false)

    if (!result.success) {
      Alert.alert('Could not reset password', result.error ?? 'Please try again.')
      return
    }

    // Clear the recovery session so the user logs in fresh with the new
    // password (also prevents staying on a half-authenticated session).
    await signOut()
    Alert.alert('Password updated', 'Please sign in with your new password.', [
      { text: 'OK', onPress: () => router.replace('/(auth)/login') },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Account Recovery</Text>
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>Choose a new password for your account.</Text>
        </View>

        <View style={styles.card}>
          <Input
            label="New Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            isPassword
            editable={!loading}
          />
          <Input
            label="Confirm New Password"
            placeholder="Re-enter your new password"
            value={confirm}
            onChangeText={setConfirm}
            isPassword
            editable={!loading}
          />
          <Button
            label="Update Password"
            onPress={handleReset}
            loading={loading}
            style={styles.submit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
      justifyContent: 'center',
      padding: t.space.xl,
    },
    header: {
      alignItems: 'center',
      marginBottom: t.space['2xl'],
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.accent,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
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
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
      textAlign: 'center',
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.xl,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    submit: {
      marginTop: t.space.sm,
    },
  })
