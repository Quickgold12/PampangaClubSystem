// ─────────────────────────────────────────────────────────────────────────────
// DateField / TimeField — native date & time pickers with a consistent UI
// to match the Input component (label + tappable display row).
//
// Why these wrappers exist:
//   • @react-native-community/datetimepicker has a slightly different shape on
//     each platform. Centralising it in one component means screens just deal
//     with "string in, string out" values matching what they already used
//     before (YYYY-MM-DD for date, "3:00 PM" for time).
//   • Tapping the display row opens the native picker. iOS shows it inline-ish
//     (spinner sheet), Android shows a system dialog.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import React, { useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'

// ── DateField ───────────────────────────────────────────────────────────────
// Stores and emits "YYYY-MM-DD" strings (same format the rest of the app uses).
export function DateField({
  label,
  value,
  onChange,
  editable = true,
}: {
  label: string
  value: string // YYYY-MM-DD
  onChange: (next: string) => void
  editable?: boolean
}): React.JSX.Element {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [open, setOpen] = useState(false)

  // Parse the current value to a Date. Fall back to today on bad input.
  const parsed = useMemo(() => {
    const d = new Date(`${value}T00:00:00`)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [value])

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    // Android: the picker closes itself; the event fires once.
    // iOS: the picker stays open until dismissed; the event may fire on each tick.
    if (Platform.OS !== 'ios') setOpen(false)
    if (!selected) return
    // Format to YYYY-MM-DD using local date parts (avoid UTC shift from toISOString).
    const yyyy = selected.getFullYear()
    const mm = String(selected.getMonth() + 1).padStart(2, '0')
    const dd = String(selected.getDate()).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => editable && setOpen(true)}
        disabled={!editable}
        style={({ pressed }) => [styles.wrapper, pressed && editable && styles.wrapperPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatHumanDate(parsed)}`}
      >
        <Text style={styles.value}>{formatHumanDate(parsed)}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={parsed}
          mode="date"
          // 'default' on Android renders the system dialog; 'spinner' on iOS.
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
      {/* iOS keeps the spinner open until "Done" — give the user a way to dismiss. */}
      {open && Platform.OS === 'ios' && (
        <Pressable onPress={() => setOpen(false)} style={styles.iosDone}>
          <Text style={styles.iosDoneText}>Done</Text>
        </Pressable>
      )}
    </View>
  )
}

// ── TimeField ───────────────────────────────────────────────────────────────
// Stores and emits free-text time strings like "3:00 PM". Empty string =
// "no time set" — emitted as '' when the user hasn't picked anything yet.
export function TimeField({
  label,
  value,
  onChange,
  editable = true,
}: {
  label: string
  value: string // e.g. "3:00 PM" or ""
  onChange: (next: string) => void
  editable?: boolean
}): React.JSX.Element {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [open, setOpen] = useState(false)

  // Parse the current value into a Date (today, with that time). Default to noon.
  const parsed = useMemo(() => {
    const base = new Date()
    base.setSeconds(0, 0)
    if (!value) {
      base.setHours(12, 0)
      return base
    }
    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
    if (match) {
      let h = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      const ap = match[3]?.toUpperCase()
      if (ap === 'PM' && h < 12) h += 12
      if (ap === 'AM' && h === 12) h = 0
      base.setHours(h, m)
    }
    return base
  }, [value])

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setOpen(false)
    if (!selected) return
    onChange(formatHumanTime(selected))
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => editable && setOpen(true)}
        disabled={!editable}
        style={({ pressed }) => [styles.wrapper, pressed && editable && styles.wrapperPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || 'not set'}`}
      >
        <Text style={[styles.value, !value && styles.valuePlaceholder]}>
          {value || 'Tap to set'}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={parsed}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
      {open && Platform.OS === 'ios' && (
        <Pressable onPress={() => setOpen(false)} style={styles.iosDone}>
          <Text style={styles.iosDoneText}>Done</Text>
        </Pressable>
      )}
    </View>
  )
}

// "Fri, May 30, 2026"
const formatHumanDate = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

// "3:00 PM"
const formatHumanTime = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { marginBottom: t.space.lg },
    label: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    wrapper: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      minHeight: t.touchTarget,
      justifyContent: 'center',
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.md,
    },
    wrapperPressed: { backgroundColor: t.color.surfaceMuted },
    value: { fontSize: t.font.size.body, color: t.color.text },
    valuePlaceholder: { color: t.color.textSubtle },
    iosDone: { alignSelf: 'flex-end', padding: t.space.sm, marginTop: t.space.xs },
    iosDoneText: { color: t.color.brandPressed, fontWeight: t.font.weight.semibold },
  })
