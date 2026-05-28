// Design tokens — single source of truth for color, spacing, type, radii, motion.
// Built per Impeccable design rules (pbakaus/impeccable).
//
// Brand: bright sunny yellow (school-spirit energy). Yellow can't carry white text on its own
//   (contrast fails), so the brand surface is paired with DARK text (Impeccable color rule:
//   text on colored bg is a darker shade of the same hue, not gray-on-color).
// Neutrals: warm-tinted (very subtle yellow undertone) so the whole app feels cohesive.
// Both light and dark themes share the same shape — components import `useTheme()` and the
//   right one is picked from `useColorScheme()`.

import { Easing } from 'react-native'

const sharedSpace = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const

const sharedRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const

const sharedFont = {
  size: {
    caption: 12,
    bodySm: 14,
    body: 16,
    lead: 20,
    h3: 24,
    h2: 30,
    h1: 36,
  },
  lineHeight: {
    caption: 16,
    bodySm: 20,
    body: 24,
    lead: 28,
    h3: 32,
    h2: 36,
    h1: 44,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  tracking: {
    tight: -0.2,
    normal: 0,
    caps: 1.2,
  },
} as const

const sharedMotion = {
  duration: { micro: 120, base: 200, slow: 320 },
  easing: {
    enter: Easing.bezier(0.16, 1, 0.3, 1),
    exit: Easing.bezier(0.7, 0, 0.84, 0),
    standard: Easing.bezier(0.65, 0, 0.35, 1),
  },
} as const

const TOUCH_TARGET = 44

// ─── Light palette ────────────────────────────────────────────────────────────────
// School colors: PURE YELLOW + PURE WHITE only.
//   - background = #FFFFFF
//   - brand surface (buttons) = #FFE600 (school yellow)
//   - accent (heading text)   = #FFE600 (school yellow on white)
//   - On-brand text and body  = #000000 (black) — only readable choice on yellow/white.
//     White text on yellow fails WCAG (~1.07:1) and is unreadable; black on yellow is ~19:1.
// Shifted from pure yellow to YELLOWISH-ORANGE (amber) so brand surfaces
// stay warm but text on white is now properly readable. Old "accent" was
// full-saturation yellow on white (~1.5:1 — failed contrast). Now `accent`
// is a deeper amber used only for small details; page titles use `text`.
const light = {
  brand: '#F59E0B',         // amber 500 — yellowish-orange, school feel intact
  brandHover: '#FB8C00',
  brandPressed: '#D97706',
  brandSubtle: '#FFF4D6',   // pale amber tint for selected/highlight surfaces
  accent: '#B45309',        // deep amber — small accents (links, eyebrows)
  onBrand: '#1F1300',       // near-black on amber → ~14:1, fully readable

  background: '#FFFBF2',    // very faint warm off-white — matches brand warmth
  surface: '#FFFFFF',
  surfaceMuted: '#F5F0E6',  // warm gray for muted surfaces
  inputBg: '#FFFFFF',
  border: '#E5E0D5',        // warm border tone
  borderStrong: '#A3A3A3',

  text: '#171717',          // near-black for body — readable everywhere
  textMuted: '#525252',
  textSubtle: '#737373',
  textDisabled: '#A3A3A3',
  textInverse: '#FFFFFF',

  success: '#15803D',
  successSubtle: '#DCFCE7',
  warning: '#B45309',
  warningSubtle: '#FEF3C7',
  danger: '#B91C1C',
  dangerSubtle: '#FEE2E2',
  info: '#1D4ED8',
  infoSubtle: '#DBEAFE',

  focusRing: '#D97706',     // matches brandPressed so focus rings feel native
}

// ─── Dark palette ─────────────────────────────────────────────────────────────────
// Per Impeccable: dark mode is not inverted light. Surfaces step in lightness;
// brand hue stays. Avoid pure black; use neutral dark surfaces (no warm tint).
// Brand stays as a brighter amber here so white text remains readable.
const dark = {
  brand: '#D97706',
  brandHover: '#F59E0B',
  brandPressed: '#B45309',
  brandSubtle: '#3A2A09',   // dark gold-tinted accent surface
  accent: '#FBBF24',        // bright school yellow — readable on dark surfaces (4.5:1+)
  onBrand: '#FFFFFF',       // white text on amber works in dark mode too

  background: '#0C0C0E',    // near-black, neutral (no warm tint)
  surface: '#18181B',
  surfaceMuted: '#27272A',
  inputBg: '#18181B',
  border: '#3F3F46',
  borderStrong: '#52525B',

  text: '#FAFAFA',          // clean cream-white
  textMuted: '#D4D4D8',
  textSubtle: '#A1A1AA',
  textDisabled: '#71717A',
  textInverse: '#18181B',

  success: '#4ADE80',
  successSubtle: '#14532D',
  warning: '#F59E0B',
  warningSubtle: '#3A2A09',
  danger: '#F87171',
  dangerSubtle: '#450A0A',
  info: '#60A5FA',
  infoSubtle: '#1E3A8A',

  focusRing: '#F59E0B',
}

const buildTheme = (color: typeof light) => ({
  color,
  space: sharedSpace,
  radius: sharedRadius,
  font: sharedFont,
  motion: sharedMotion,
  shadow: {
    card: {
      shadowColor: color.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
  },
  touchTarget: TOUCH_TARGET,
})

export const lightTheme = buildTheme(light)
export const darkTheme = buildTheme(dark)

// Default `theme` export stays so any non-hookable code path still works.
export const theme = lightTheme

export type Theme = typeof lightTheme
