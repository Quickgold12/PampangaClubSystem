// Reusable button component.
// Themed: pulls colors from useTheme() so it tracks system light/dark.
// Impeccable polish:
//   - Pressable with real pressed/focused/disabled states.
//   - Pressed scale animates over 120ms (motion.duration.micro / motion.easing.enter),
//     respects prefers-reduced-motion via AccessibilityInfo.
//   - Tokens only — no raw hex.
//   - 44pt minimum touch target.
//   - Brand surface (yellow) carries DARK label text — Impeccable color rule (no gray on color).
import { useTheme } from '@/hooks/use-theme'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native'

type ButtonProps = {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary'
  style?: ViewStyle
}

const Button = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}: ButtonProps): React.JSX.Element => {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  const isDisabled = disabled || loading
  const scale = useRef(new Animated.Value(1)).current
  const [reduceMotion, setReduceMotion] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub.remove()
  }, [])

  const animateTo = (value: number) => {
    if (reduceMotion) {
      scale.setValue(value)
      return
    }
    Animated.timing(scale, {
      toValue: value,
      duration: theme.motion.duration.micro,
      easing: theme.motion.easing.enter,
      useNativeDriver: true,
    }).start()
  }

  const variantStyle = variant === 'secondary' ? styles.secondary : styles.primary
  const labelStyle = variant === 'secondary' ? styles.labelSecondary : styles.labelPrimary

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        onPress={onPress}
        disabled={isDisabled}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={({ pressed }) => [
          styles.base,
          variantStyle,
          isDisabled && styles.disabled,
          pressed && !isDisabled && styles.pressed,
          isFocused && styles.focused,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'secondary' ? theme.color.brand : theme.color.onBrand} />
        ) : (
          <Text style={labelStyle}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  )
}

export default Button

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    base: {
      minHeight: t.touchTarget,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {
      backgroundColor: t.color.brand,
    },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: t.color.brand,
    },
    pressed: {
      backgroundColor: t.color.brandPressed,
    },
    focused: {
      borderWidth: 2,
      borderColor: t.color.focusRing,
    },
    disabled: {
      backgroundColor: t.color.surfaceMuted,
      borderColor: t.color.border,
    },
    labelPrimary: {
      color: t.color.onBrand,
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      fontWeight: t.font.weight.semibold,
      letterSpacing: 0.2,
    },
    labelSecondary: {
      color: t.color.brand,
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      fontWeight: t.font.weight.semibold,
    },
  })
