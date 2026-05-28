// Reusable input component.
// Themed: pulls colors from useTheme() so it tracks system light/dark.
// Impeccable polish:
//   - Tracks its own focus state and renders a 2px focus ring (Impeccable interaction rule).
//   - Validation errors get a red border + descriptive text below, linked via accessibilityHint.
//   - Visible <Text> label — placeholders never substitute for labels.
//   - 44pt minimum touch target on the password-visibility toggle.
//   - Tokens only — no raw hex.
import { useTheme } from '@/hooks/use-theme'
import React, { useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native'

type InputProps = TextInputProps & {
  label: string
  error?: string
  isPassword?: boolean
}

const Input = ({
  label,
  error,
  isPassword = false,
  onFocus,
  onBlur,
  ...props
}: InputProps): React.JSX.Element => {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const [showPassword, setShowPassword] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.wrapper,
          isFocused && styles.wrapperFocused,
          error ? styles.wrapperError : null,
        ]}
      >
        <TextInput
          secureTextEntry={isPassword && !showPassword}
          placeholderTextColor={theme.color.textSubtle}
          accessibilityLabel={label}
          accessibilityHint={error}
          onFocus={(e) => {
            setIsFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setIsFocused(false)
            onBlur?.(e)
          }}
          {...props}
          // Style is merged LAST so callers can extend (not replace) the
          // default padding/font. Use this for multiline fields, custom
          // heights, etc.
          style={[styles.input, props.style]}
        />
        {isPassword && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            onPress={() => setShowPassword(!showPassword)}
            style={({ pressed }) => [styles.eyeButton, pressed && styles.eyeButtonPressed]}
            hitSlop={8}
          >
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  )
}

export default Input

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      marginBottom: t.space.lg,
    },
    label: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      minHeight: t.touchTarget,
    },
    wrapperFocused: {
      borderWidth: 2,
      borderColor: t.color.focusRing,
    },
    wrapperError: {
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    input: {
      flex: 1,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
    },
    eyeButton: {
      minWidth: t.touchTarget,
      minHeight: t.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: t.space.md,
    },
    eyeButtonPressed: {
      opacity: 0.6,
    },
    eyeIcon: {
      fontSize: t.font.size.lead,
    },
    errorText: {
      color: t.color.danger,
      fontSize: t.font.size.caption,
      lineHeight: t.font.lineHeight.caption,
      marginTop: t.space.xs,
    },
  })
