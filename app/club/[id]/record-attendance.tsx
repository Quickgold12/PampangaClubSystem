// ─────────────────────────────────────────────────────────────────────────────
// Record Attendance screen — officer/adviser-only.
//
// What this screen does:
//   • Officer fills in an event name + date (defaults to today's date).
//   • Below that, the full member roster is shown as a checkable list.
//   • Tap members to toggle them present/absent.
//   • "Save Attendance" calls recordAttendance() which upserts one row per
//     checked member — re-running the same submit is safe (no duplicates).
//
// Date input is a plain text field with YYYY-MM-DD format to keep things
// dependency-free; we validate it client-side before submitting.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import { DateField } from '@/components/common/DateField'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import { recordAttendance } from '@/services/attendance.service'
import { getClubDetail } from '@/services/clubs.service'
import { ClubDetail } from '@/types'
import { sanitizeText } from '@/utils/sanitize'
import { toastSuccess } from '@/utils/toast'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

// "today" in ISO date format. Used as the default for the date input.
const todayISO = () => new Date().toISOString().slice(0, 10)
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export default function RecordAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [eventName, setEventName] = useState('')
  const [attendedDate, setAttendedDate] = useState(todayISO())
  // Set of user_ids marked present. We use Set for O(1) toggle.
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const { data } = await getClubDetail(id)
    if (data) setClub(data)
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Flip a user's presence. Cloning the Set is required for React to detect
  // the state change (mutating in place wouldn't re-render).
  const toggle = (userId: string) => {
    setPresentIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  // Mark every visible member as present in one go — useful when the meeting
  // had near-full attendance and the officer just needs to uncheck a few.
  const markAll = () => {
    if (!club) return
    setPresentIds(new Set(club.members.map((m) => m.id)))
  }
  const clearAll = () => setPresentIds(new Set())

  const handleSave = async () => {
    if (!id || !user) return
    const cleanName = sanitizeText(eventName)
    if (!cleanName) {
      Alert.alert('Missing event name', 'Please enter what this attendance is for.')
      return
    }
    if (!DATE_REGEX.test(attendedDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format, e.g. 2026-05-18.')
      return
    }
    if (presentIds.size === 0) {
      Alert.alert('No one selected', 'Tap members to mark them as present first.')
      return
    }

    setSaving(true)
    const { data, error } = await recordAttendance(
      id,
      cleanName,
      attendedDate,
      Array.from(presentIds),
      user.id
    )
    setSaving(false)

    if (error) {
      Alert.alert('Could not save', error)
      return
    }
    // Toast persists across navigation (rendered at root), so we can navigate
    // back immediately and the user still sees the confirmation.
    toastSuccess('Attendance saved', `${data?.inserted ?? 0} marked present for "${cleanName}".`)
    router.back()
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.color.brand} />
      </View>
    )
  }
  if (!club) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Club not found.</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Record Attendance', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          <Text style={styles.title}>New Event</Text>
        </View>

        <View style={styles.card}>
          <Input
            label="Event Name"
            placeholder="Weekly Meeting"
            value={eventName}
            onChangeText={setEventName}
            editable={!saving}
          />
          <DateField label="Date" value={attendedDate} onChange={setAttendedDate} editable={!saving} />
        </View>

        <View style={styles.card}>
          <View style={styles.rosterHeader}>
            <Text style={styles.cardLabel}>Attendees ({presentIds.size}/{club.members.length})</Text>
            <View style={styles.rosterActions}>
              <Pressable onPress={markAll} hitSlop={8}>
                <Text style={styles.linkText}>All</Text>
              </Pressable>
              <Pressable onPress={clearAll} hitSlop={8}>
                <Text style={styles.linkText}>None</Text>
              </Pressable>
            </View>
          </View>

          {club.members.length === 0 ? (
            <Text style={styles.bodyMuted}>This club has no members yet.</Text>
          ) : (
            club.members.map((m) => {
              const isPresent = presentIds.has(m.id)
              return (
                <Pressable
                  key={m.id}
                  onPress={() => toggle(m.id)}
                  style={({ pressed }) => [
                    styles.memberRow,
                    isPresent && styles.memberRowSelected,
                    pressed && styles.memberRowPressed,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isPresent }}
                >
                  <View style={[styles.checkbox, isPresent && styles.checkboxOn]}>
                    {isPresent && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.memberName}>{m.full_name}</Text>
                  {m.role_in_club === 'officer' && (
                    <View style={styles.officerPill}>
                      <Text style={styles.officerPillText}>Officer</Text>
                    </View>
                  )}
                </Pressable>
              )
            })
          )}
        </View>

        <Button label="Save Attendance" onPress={handleSave} loading={saving} />
      </ScrollView>
    </>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.color.background,
    },
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    header: {
      marginBottom: t.space.lg,
    },
    eyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    title: {
      fontSize: t.font.size.h1,
      lineHeight: t.font.lineHeight.h1,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    cardLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    rosterHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: t.space.sm,
    },
    rosterActions: {
      flexDirection: 'row',
      gap: t.space.md,
    },
    linkText: {
      fontSize: t.font.size.bodySm,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.sm,
      borderRadius: t.radius.md,
      gap: t.space.md,
    },
    memberRowSelected: {
      backgroundColor: t.color.brandSubtle,
    },
    memberRowPressed: {
      opacity: 0.7,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: t.radius.sm,
      borderWidth: 2,
      borderColor: t.color.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: {
      backgroundColor: t.color.brand,
      borderColor: t.color.brand,
    },
    checkmark: {
      color: t.color.onBrand,
      fontWeight: t.font.weight.bold,
      fontSize: 14,
    },
    memberName: {
      flex: 1,
      fontSize: t.font.size.body,
      color: t.color.text,
    },
    officerPill: {
      backgroundColor: t.color.surfaceMuted,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.sm,
      paddingVertical: 2,
    },
    officerPillText: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
    },
    bodyMuted: {
      fontSize: t.font.size.bodySm,
      color: t.color.textMuted,
    },
    emptyText: {
      color: t.color.textSubtle,
      fontSize: t.font.size.body,
    },
  })
