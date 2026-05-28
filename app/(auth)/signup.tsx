// Signup screen.
// Themed: pulls colors from useTheme() so it tracks system light/dark mode.
// Impeccable polish:
//   - Tokens only — no raw hex.
//   - Hierarchy via 3 axes (size + weight + color).
//   - Eyebrow uses ALL-CAPS + tracking.
//   - Role picker rows are 44pt+ with clear pressed/selected states.
//   - Selected role surface uses brandSubtle bg with brand text (no gray-on-color).
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Logo from '@/components/common/Logo'
import { ROLES } from '@/constants'
import { useTheme } from '@/hooks/use-theme'
import { signUp } from '@/services/auth.service'
import { UserRole } from '@/types'
import { sanitizeEmail, sanitizeText } from '@/utils/sanitize'
import {
    validateEmail,
    validateFullName,
    validatePassword,
    validatePasswordMatch,
    validateRole,
} from '@/utils/validation'
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

export default function SignupScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<UserRole | ''>('')
  const [loading, setLoading] = useState(false)

  const validateForm = (): string | null => {
    return (
      validateFullName(sanitizeText(fullName)) ||
      validateEmail(sanitizeEmail(email)) ||
      validatePassword(password) ||
      validatePasswordMatch(password, confirmPassword) ||
      validateRole(role)
    )
  }

  const handleSignup = async () => {
    const error = validateForm()
    if (error) return Alert.alert('Error', error)

    setLoading(true)

    try {
      const result = await signUp({
        email: sanitizeEmail(email),
        password,
        fullName: sanitizeText(fullName),
        role: role as UserRole,
      })

      if (!result.success) {
        Alert.alert('Signup Failed', result.error)
        return
      }

      Alert.alert(
        'Account Created',
        'Your account has been created. Please sign in.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      )
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
        {/* School seal — same hero treatment as the login screen. Slightly
            smaller here because the signup form is longer and we want the
            form fields visible without scrolling. */}
        <View style={styles.logoWrap}>
          <Logo size={84} />
        </View>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Pampanga High School</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join your club management system</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Full Name"
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            editable={!loading}
          />

          <Input
            label="Email Address"
            placeholder="you@school.edu"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          <Input
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            isPassword
            editable={!loading}
          />

          <Input
            label="Confirm Password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            isPassword
            editable={!loading}
          />

          <Text style={styles.roleSectionLabel}>Select Your Role</Text>
          <View style={styles.roleList}>
            {ROLES.map((item) => {
              const isSelected = role === item.value
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: loading }}
                  onPress={() => setRole(item.value as UserRole)}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.roleOption,
                    isSelected && styles.roleOptionSelected,
                    pressed && !isSelected && styles.roleOptionPressed,
                  ]}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.roleLabel, isSelected && styles.roleLabelSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Button
            label="Create Account"
            onPress={handleSignup}
            loading={loading}
            style={styles.submit}
          />

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.loginLink, pressed && styles.loginLinkPressed]}
            hitSlop={8}
          >
            <Text style={styles.loginText}>
              Already have an account?{' '}
              <Text style={styles.loginTextBold}>Sign In</Text>
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
    // Logo container — centered, sits above the header.
    logoWrap: {
      alignItems: 'center',
      marginTop: t.space.md,
      marginBottom: t.space.md,
    },
    header: {
      alignItems: 'center',
      marginBottom: t.space['2xl'],
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      // Brand accent for the eyebrow — small caps, ties to school identity.
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
      // Switched from `accent` (yellow on white = unreadable) to `text`.
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
    },
    form: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.xl,
      ...t.shadow.card,
    },
    roleSectionLabel: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
      marginTop: t.space.xs,
      marginBottom: t.space.md,
    },
    roleList: {
      gap: t.space.sm,
      marginBottom: t.space.xl,
    },
    roleOption: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: t.touchTarget,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      backgroundColor: t.color.surface,
      gap: t.space.md,
    },
    roleOptionSelected: {
      borderColor: t.color.brand,
      backgroundColor: t.color.brandSubtle,
    },
    roleOptionPressed: {
      backgroundColor: t.color.surfaceMuted,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: t.radius.pill,
      borderWidth: 2,
      borderColor: t.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      borderColor: t.color.brand,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.brand,
    },
    roleLabel: {
      flex: 1,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      color: t.color.text,
    },
    roleLabelSelected: {
      color: t.color.text, // selected row already shows brandSubtle bg; keep text high-contrast
      fontWeight: t.font.weight.semibold,
    },
    submit: {
      marginTop: t.space.sm,
    },
    loginLink: {
      alignItems: 'center',
      marginTop: t.space.xl,
      minHeight: t.touchTarget,
      justifyContent: 'center',
    },
    loginLinkPressed: {
      opacity: 0.6,
    },
    loginText: {
      color: t.color.textMuted,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
    },
    loginTextBold: {
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
  })
