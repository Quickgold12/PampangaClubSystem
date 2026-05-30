// ─────────────────────────────────────────────────────────────────────────────
// QR Check-In (officer / adviser view).
//
// Flow:
//   1. Officer types the event name and taps "Start Check-In".
//   2. We open a checkin_sessions row and render its id as a QR code.
//   3. Members scan it (Scan to Check In on their side) and their attendance is
//      recorded into the same attendance table used everywhere else.
//   4. A live "checked in" counter polls so the officer can watch it climb,
//      and "End Check-In" closes the session (the QR stops working).
//
// Gated to officers/advisers/faculty of THIS club — RLS also enforces it on
// the insert, this is just so members don't see a dead button.
// ─────────────────────────────────────────────────────────────────────────────
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/use-theme'
import {
  CheckinSession,
  closeCheckinSession,
  countCheckedIn,
  createCheckinSession,
} from '@/services/attendance.service'
import { getClubDetail } from '@/services/clubs.service'
import { ClubDetail } from '@/types'
import { Stack, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

export default function CheckinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { user } = useAuth()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [eventName, setEventName] = useState('')
  const [session, setSession] = useState<CheckinSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [checkedIn, setCheckedIn] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!id) return
    getClubDetail(id)
      .then((res) => res.data && setClub(res.data))
      .finally(() => setLoading(false))
  }, [id])

  // Permission check for THIS club (RLS is the real gate; this hides the UI).
  const canManage = useMemo(() => {
    if (!user || !club) return false
    if (user.id === club.adviser_id || user.id === club.faculty_coordinator_id) return true
    return club.members.some((m) => m.id === user.id && m.role_in_club === 'officer')
  }, [user, club])

  // While a session is live, poll the checked-in count every few seconds.
  useEffect(() => {
    if (!session) return
    const tick = async () => {
      const { data } = await countCheckedIn(session)
      if (typeof data === 'number') setCheckedIn(data)
    }
    tick()
    pollRef.current = setInterval(tick, 4000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [session])

  const start = async () => {
    if (!id || !user) return
    setStarting(true)
    const { data, error } = await createCheckinSession(id, eventName, user.id)
    setStarting(false)
    if (error || !data) {
      Alert.alert('Could not start', error ?? 'Please try again.')
      return
    }
    setSession(data)
    setCheckedIn(0)
  }

  const end = useCallback(() => {
    if (!session) return
    Alert.alert('End check-in?', 'The QR code will stop working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          await closeCheckinSession(session.id)
          setSession(null)
          setEventName('')
        },
      },
    ])
  }, [session])

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
        <Text style={styles.muted}>Club not found.</Text>
      </View>
    )
  }

  if (!canManage) {
    return (
      <>
        <Stack.Screen options={{ title: 'QR Check-In', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>Only officers and advisers can run check-in.</Text>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'QR Check-In', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{club.name}</Text>

        {!session ? (
          // ── Setup: name the event, then start ──────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Start a check-in</Text>
            <Text style={styles.help}>
              Name the event, then show the QR code to your members. Each member
              scans it once to mark themselves present.
            </Text>
            <Input
              label="Event name"
              placeholder="e.g. General Assembly"
              value={eventName}
              onChangeText={setEventName}
              editable={!starting}
            />
            <Button label="Start Check-In" onPress={start} loading={starting} />
          </View>
        ) : (
          // ── Live: show the QR + a running count ────────────────────────
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{session.event_name}</Text>
            <View style={styles.qrWrap}>
              <QRCode value={session.id} size={240} backgroundColor="#FFFFFF" />
            </View>
            <Text style={styles.scanHint}>Members: open a club → Scan to Check In</Text>

            <View style={styles.counter}>
              <Text style={styles.counterNumber}>{checkedIn}</Text>
              <Text style={styles.counterLabel}>checked in</Text>
            </View>

            <Pressable
              onPress={end}
              style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="End check-in"
            >
              <Text style={styles.endButtonText}>End Check-In</Text>
            </Pressable>
          </View>
        )}
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
      padding: t.space.xl,
    },
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    heading: {
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.lg,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.xl,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadow.card,
    },
    cardLabel: {
      fontSize: t.font.size.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.sm,
      textAlign: 'center',
    },
    help: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      color: t.color.textMuted,
      marginBottom: t.space.lg,
    },
    qrWrap: {
      alignSelf: 'center',
      padding: t.space.md,
      backgroundColor: '#FFFFFF',
      borderRadius: t.radius.md,
      marginVertical: t.space.lg,
    },
    scanHint: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      textAlign: 'center',
      marginBottom: t.space.lg,
    },
    counter: {
      alignItems: 'center',
      paddingVertical: t.space.md,
      marginBottom: t.space.lg,
    },
    counterNumber: {
      fontSize: t.font.size.h1,
      lineHeight: t.font.lineHeight.h1,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    counterLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
    },
    endButton: {
      backgroundColor: t.color.dangerSubtle,
      borderRadius: t.radius.md,
      paddingVertical: t.space.md,
      alignItems: 'center',
    },
    endButtonPressed: {
      opacity: 0.8,
    },
    endButtonText: {
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.bodySm,
    },
    muted: {
      fontSize: t.font.size.body,
      color: t.color.textSubtle,
      textAlign: 'center',
    },
  })
