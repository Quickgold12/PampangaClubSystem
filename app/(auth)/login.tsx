// Login screen.
// Themed: pulls colors from useTheme() so it tracks system light/dark mode.
// Impeccable polish:
//   - All colors / spacing / type from `theme` tokens — no raw hex.
//   - Hierarchy via 3 axes: size, weight, color.
//   - School-name eyebrow: ALL-CAPS with +tracking (Impeccable typography rule).
//   - Lockout banner uses dangerSubtle bg with danger text (no gray on color).
//   - Apostrophe escaped in JSX (react/no-unescaped-entities).
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Logo from '@/components/common/Logo'
import { AUTH } from '@/constants'
import { useTheme } from '@/hooks/use-theme'
import { signIn } from '@/services/auth.service'
import { sanitizeEmail, sanitizeText } from '@/utils/sanitize'
import { validateEmail, validatePassword } from '@/utils/validation'
import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native'

export default function LoginScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null)

  const isLockedOut = (): boolean => {
    if (!lockedUntil) return false
    return new Date() < lockedUntil
  }

  const getRemainingTime = (): number => {
    if (!lockedUntil) return 0
    return Math.ceil((lockedUntil.getTime() - new Date().getTime()) / 1000)
  }

  const handleLockout = (newAttempts: number) => {
    if (newAttempts < AUTH.MAX_LOGIN_ATTEMPTS) {
      Alert.alert(
        'Login Failed',
        `Invalid email or password. ${AUTH.MAX_LOGIN_ATTEMPTS - newAttempts} attempts remaining.`
      )
      return
    }

    const lockoutTime = new Date()
    lockoutTime.setSeconds(lockoutTime.getSeconds() + AUTH.LOCKOUT_DURATION_SECONDS)
    setLockedUntil(lockoutTime)
    Alert.alert(
      'Account Temporarily Locked',
      `Too many failed attempts. Try again in ${AUTH.LOCKOUT_DURATION_SECONDS / 60} minutes.`
    )
  }

  const handleLogin = async () => {
    if (isLockedOut()) {
      Alert.alert('Locked', `Try again in ${getRemainingTime()} seconds.`)
      return
    }

    const cleanEmail = sanitizeEmail(email)
    const cleanPassword = sanitizeText(password)

    const emailError = validateEmail(cleanEmail)
    const passwordError = validatePassword(cleanPassword, 6)

    if (emailError) return Alert.alert('Error', emailError)
    if (passwordError) return Alert.alert('Error', passwordError)

    setLoading(true)

    try {
      const result = await signIn(cleanEmail, cleanPassword)

      if (!result.success) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        handleLockout(newAttempts)
        return
      }

      setAttempts(0)
      setLockedUntil(null)
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* School seal as the hero — standard auth-screen placement.
            Wordmark is OFF here because the title below already says "Club
            Management" and the eyebrow says "Pampanga High School". */}
        <View style={styles.logoWrap}>
          <Logo size={104} />
        </View>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Pampanga High School</Text>
          <Text style={styles.title}>Club Management</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {isLockedOut() && (
          <View style={styles.lockoutBanner} accessibilityRole="alert">
            <Text style={styles.lockoutText}>
              Account locked. Try again in {getRemainingTime()} seconds.
            </Text>
          </View>
        )}

        {attempts > 0 && !isLockedOut() && (
          <View style={styles.warningBanner} accessibilityRole="alert">
            <Text style={styles.warningText}>
              {AUTH.MAX_LOGIN_ATTEMPTS - attempts} attempts remaining
            </Text>
          </View>
        )}

        <View style={styles.form}>
          <Input
            label="Email Address"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading && !isLockedOut()}
          />

          <Input
            label="Password"
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
            isPassword
            editable={!loading && !isLockedOut()}
          />

          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={isLockedOut()}
            style={styles.submit}
          />

          {/* Forgot-password entry point → recovery flow. */}
          <Pressable
            onPress={() => router.push('/(auth)/forgot-password' as never)}
            style={({ pressed }) => [styles.forgotLink, pressed && styles.signupLinkPressed]}
            hitSlop={8}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/signup')}
            style={({ pressed }) => [styles.signupLink, pressed && styles.signupLinkPressed]}
            hitSlop={8}
          >
            <Text style={styles.signupText}>
              {/* FIX: escaped apostrophe to satisfy react/no-unescaped-entities */}
              Don&apos;t have an account?{' '}
              <Text style={styles.signupTextBold}>Sign Up</Text>
            </Text>
          </Pressable>
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
    scrollContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: t.space.xl,
    },
    // Logo container — centered, with breathing room above/below.
    logoWrap: {
      alignItems: 'center',
      marginTop: t.space.lg,
      marginBottom: t.space.lg,
    },
    header: {
      alignItems: 'center',
      marginBottom: t.space['2xl'],
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      // Eyebrow uses brand accent now (was textMuted) — small enough to
      // read on white, and ties the eyebrow to the school identity.
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
      // Switched from `accent` (yellow) to `text` (near-black). The yellow
      // version was unreadable on white. Brand color is still present on
      // the eyebrow + button, so the school identity isn't lost.
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
    },
    lockoutBanner: {
      backgroundColor: t.color.dangerSubtle,
      borderRadius: t.radius.sm,
      padding: t.space.md,
      marginBottom: t.space.lg,
      borderLeftWidth: 4,
      borderLeftColor: t.color.danger,
    },
    lockoutText: {
      color: t.color.danger,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    warningBanner: {
      backgroundColor: t.color.warningSubtle,
      borderRadius: t.radius.sm,
      padding: t.space.md,
      marginBottom: t.space.lg,
      borderLeftWidth: 4,
      borderLeftColor: t.color.warning,
    },
    warningText: {
      color: t.color.warning,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    form: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.xl,
      ...t.shadow.card,
    },
    submit: {
      marginTop: t.space.sm,
    },
    // Forgot-password link — centered, just below the Sign In button.
    forgotLink: {
      alignItems: 'center',
      marginTop: t.space.md,
      minHeight: t.touchTarget,
      justifyContent: 'center',
    },
    forgotText: {
      color: t.color.brandPressed,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    signupLink: {
      alignItems: 'center',
      marginTop: t.space.sm,
      minHeight: t.touchTarget,
      justifyContent: 'center',
    },
    signupLinkPressed: {
      opacity: 0.6,
    },
    signupText: {
      color: t.color.textMuted,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
    },
    signupTextBold: {
      color: t.color.brandPressed, // darker brand reads as a link on both light & dark surfaces
      fontWeight: t.font.weight.semibold,
    },
  })
