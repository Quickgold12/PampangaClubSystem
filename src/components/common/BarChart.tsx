// ─────────────────────────────────────────────────────────────────────────────
// BarChart — a lightweight, dependency-free vertical bar chart built from plain
// Views (no SVG, no chart library). Each bar's height is proportional to its
// value relative to the max. Renders the value above each bar and a (possibly
// two-line) label below.
//
// Designed for small datasets (≤ ~10 bars) — club analytics, not big data.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import React, { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

export type Bar = { label: string; value: number }

type Props = {
  data: Bar[]
  // Tallest bar height in px. Bars scale relative to the largest value.
  height?: number
  // Override the bar color (defaults to the brand color).
  color?: string
}

export default function BarChart({ data, height = 140, color }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  if (data.length === 0) {
    return <Text style={styles.empty}>Not enough data yet.</Text>
  }

  const max = Math.max(...data.map((d) => d.value), 1)
  const barColor = color ?? theme.color.brand

  return (
    <View style={styles.row}>
      {data.map((d, i) => {
        // Always show a sliver (min 4px) for non-zero values so a tiny bar is
        // still visible; zero stays flat.
        const h = d.value > 0 ? Math.max(4, Math.round((d.value / max) * height)) : 0
        return (
          <View key={`${d.label}-${i}`} style={styles.col}>
            <Text style={styles.value}>{d.value}</Text>
            <View style={[styles.track, { height }]}>
              <View style={[styles.bar, { height: h, backgroundColor: barColor }]} />
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {d.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-around',
      gap: t.space.xs,
    },
    col: {
      flex: 1,
      alignItems: 'center',
    },
    value: {
      fontSize: t.font.size.caption,
      fontWeight: t.font.weight.semibold,
      color: t.color.textMuted,
      marginBottom: t.space.xs,
    },
    // The full-height track keeps every bar's baseline aligned at the bottom.
    track: {
      width: '70%',
      justifyContent: 'flex-end',
      backgroundColor: t.color.surfaceMuted,
      borderRadius: t.radius.sm,
      overflow: 'hidden',
    },
    bar: {
      width: '100%',
      borderRadius: t.radius.sm,
    },
    label: {
      fontSize: 10,
      lineHeight: 13,
      color: t.color.textSubtle,
      textAlign: 'center',
      marginTop: t.space.xs,
    },
    empty: {
      fontSize: t.font.size.bodySm,
      color: t.color.textSubtle,
      textAlign: 'center',
      paddingVertical: t.space.lg,
    },
  })
