// All app-wide constants in one place
//
// Theme tokens come from ./tokens. Components should import `useTheme()` from
// '@/hooks/use-theme' instead of pulling `theme` directly so they react to system
// light/dark mode changes. The static `theme` export is kept for non-component code paths.
import { theme } from './tokens'

export { darkTheme, lightTheme, theme } from './tokens'
export type { Theme } from './tokens'

export const AUTH = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_SECONDS: 300,
  MIN_PASSWORD_LENGTH: 8,
}

export const ROLES = [
  {
    label: 'Student Member (including SSLG)',
    value: 'student_member',
  },
  {
    label: 'Student Officer / Club Officer (including SSLG)',
    value: 'club_officer',
  },
  {
    label: 'Club Adviser',
    value: 'adviser',
  },
  {
    label: 'Faculty Coordinator',
    value: 'faculty_coordinator',
  },
] as const

// Deprecated — use `theme.color.*` instead. Kept temporarily so unrefactored
// files still compile during the polish pass.
export const COLORS = {
  primary: theme.color.brand,
  accent: theme.color.brandHover,
  background: theme.color.background,
  white: theme.color.surface,
  danger: theme.color.danger,
  warning: theme.color.warning,
  success: theme.color.success,
  gray: theme.color.textMuted,
  lightGray: theme.color.border,
  inputBg: theme.color.inputBg,
}
