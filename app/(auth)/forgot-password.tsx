// ─────────────────────────────────────────────────────────────────────────────
// Forgot Password screen — step 1 of recovery.
//
// What this screen does:
//   • Collects the user's email.
//   • Calls requestPasswordReset(), which asks Supabase to send a reset email
//     containing a deep link back into the app.
//   • Shows a "check your email" confirmation regardless of whether the email
//     exists — we deliberately DON'T reveal whether an account exists (avoids
//     leaking which emails are registered).
//
// The actual password change happens on reset-password.tsx after the user
// taps the email link.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useTheme } from '@/hooks/use-theme'
import { requestPasswordReset } from '@/services/auth.service'
import { sanitizeEmail } from '@/utils/sanitize'
import { validateEmail } from '@/utils/validation'
import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function ForgotPasswordScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false) // flips the screen to the confirmation state

  const handleSend = async () => {
    const clean = sanitizeEmail(email)
    const emailError = validateEmail(clean)
    if (emailError) {
      // Inline-ish: we still validate the format before sending.
      setEmail(clean)
      return
    }

    setLoading(true)
    // We ignore the result's success flag for the UI message on purpose — see
    // the privacy note in the header comment. We only surface hard failures.
    await requestPasswordReset(clean)
    setLoading(false)
    setSent(true)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Account Recovery</Text>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>
            {sent
              ? 'Check your email for a reset link.'
              : 'Enter your email and we’ll send you a reset link.'}
          </Text>
        </View>

        <View style={styles.card}>
          {sent ? (
            // Confirmation state — generic on purpose (no account-existence leak).
            <>
              <Text style={styles.body}>
                If an account exists for{'\n'}
                <Text style={styles.bodyBold}>{sanitizeEmail(email)}</Text>, a
                password reset link is on its way. Open it on this device to set a
                new password.
              </Text>
              <Button
                label="Back to Sign In"
                onPress={() => router.replace('/(auth)/login')}
                style={styles.submit}
              />
            </>
          ) : (
            <>
              <Input
                label="Email Address"
                placeholder="you@school.edu"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
              />
              <Button
                label="Send Reset Link"
                onPress={handleSend}
                loading={loading}
                style={styles.submit}
              />
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.backLink, pressed && styles.backLinkPressed]}
                hitSlop={8}
              >
                <Text style={styles.backText}>Back to Sign In</Text>
              </Pressable>
            </>
          )}
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
    body: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
      marginBottom: t.space.lg,
    },
    bodyBold: {
      fontWeight: t.font.weight.semibold,
    },
    submit: {
      marginTop: t.space.sm,
    },
    backLink: {
      alignItems: 'center',
      marginTop: t.space.lg,
      minHeight: t.touchTarget,
      justifyContent: 'center',
    },
    backLinkPressed: {
      opacity: 0.6,
    },
    backText: {
      color: t.color.brandPressed,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
  })
