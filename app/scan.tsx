// ─────────────────────────────────────────────────────────────────────────────
// Scan to Check In (member view).
//
// Opens the camera, scans an officer's check-in QR, and calls the check_in RPC
// to record the member's attendance. Shows a clear success/failure result with
// a "Scan again" option. Handles the camera-permission flow gracefully.
//
// Requires a development/production build — the camera isn't available in
// Expo Go on SDK 53+.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import { checkInWithSession } from '@/services/attendance.service'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router, Stack } from 'expo-router'
import React, { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

type Result = { ok: boolean; message: string } | null

export default function ScanScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [permission, requestPermission] = useCameraPermissions()

  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<Result>(null)
  // Latch so the camera fires the check-in once per scan, not every frame.
  const handledRef = useRef(false)

  const onScanned = async ({ data }: { data: string }) => {
    if (handledRef.current || processing) return
    handledRef.current = true
    setProcessing(true)
    const { data: eventName, error } = await checkInWithSession(data.trim())
    setProcessing(false)
    if (error) {
      setResult({ ok: false, message: error })
    } else {
      setResult({ ok: true, message: `You're checked in to "${eventName}".` })
    }
  }

  const scanAgain = () => {
    handledRef.current = false
    setResult(null)
  }

  // ── Permission states ──────────────────────────────────────────────────
  if (!permission) {
    return (
      <Screen title="Scan to Check In">
        <View style={styles.centered}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      </Screen>
    )
  }

  if (!permission.granted) {
    return (
      <Screen title="Scan to Check In">
        <View style={styles.centered}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.help}>
            We use the camera only to scan a club&apos;s check-in QR code. Nothing
            is recorded or stored.
          </Text>
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Allow Camera</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  // ── Result state (after a scan) ──────────────────────────────────────────
  if (result) {
    return (
      <Screen title="Scan to Check In">
        <View style={styles.centered}>
          <View style={[styles.resultIcon, result.ok ? styles.resultOk : styles.resultBad]}>
            <Text style={styles.resultIconText}>{result.ok ? '✓' : '!'}</Text>
          </View>
          <Text style={styles.title}>{result.ok ? 'Checked in!' : 'Not checked in'}</Text>
          <Text style={styles.help}>{result.message}</Text>
          <Pressable
            onPress={scanAgain}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Scan Again</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.linkBtnText}>Done</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  // ── Live camera ──────────────────────────────────────────────────────────
  return (
    <Screen title="Scan to Check In">
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
        {/* Framing reticle + hint overlay. */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.reticle} />
          <Text style={styles.overlayHint}>
            {processing ? 'Checking you in…' : 'Point at the club’s check-in QR code'}
          </Text>
        </View>
      </View>
    </Screen>
  )
}

// Thin wrapper so every state gets the same header.
function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Stack.Screen options={{ title, headerShown: true, headerBackTitle: 'Back' }} />
      {children}
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
    cameraWrap: {
      flex: 1,
      backgroundColor: '#000000',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    reticle: {
      width: 240,
      height: 240,
      borderWidth: 3,
      borderColor: '#FFFFFF',
      borderRadius: t.radius.lg,
      backgroundColor: 'transparent',
    },
    overlayHint: {
      marginTop: t.space.lg,
      color: '#FFFFFF',
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      textAlign: 'center',
      paddingHorizontal: t.space.xl,
    },
    title: {
      fontSize: t.font.size.h3,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.sm,
      textAlign: 'center',
    },
    help: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
      textAlign: 'center',
      marginBottom: t.space.xl,
    },
    primaryBtn: {
      backgroundColor: t.color.brand,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space.xl,
      paddingVertical: t.space.md,
      minHeight: 48,
      justifyContent: 'center',
    },
    btnPressed: { opacity: 0.85 },
    primaryBtnText: {
      color: t.color.onBrand,
      fontWeight: t.font.weight.semibold,
      fontSize: t.font.size.body,
    },
    linkBtn: {
      marginTop: t.space.md,
      paddingVertical: t.space.sm,
    },
    linkBtnText: {
      color: t.color.textMuted,
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.semibold,
    },
    resultIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.space.lg,
    },
    resultOk: { backgroundColor: t.color.successSubtle },
    resultBad: { backgroundColor: t.color.dangerSubtle },
    resultIconText: {
      fontSize: t.font.size.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
  })
