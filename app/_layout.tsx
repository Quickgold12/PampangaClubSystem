import ErrorBoundary from '@/components/common/ErrorBoundary'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Toast from 'react-native-toast-message'

function RootLayoutNav() {
  const { session, loading, isRecovering } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return

    const inAuthGroup = (segments[0] as string) === '(auth)'

    // Password recovery takes priority: if the user arrived via the reset
    // email link, send them to set a new password — even though they
    // technically have a (temporary) session.
    if (isRecovering) {
      // Cast: the typed-routes union may not include the new screen until
      // Expo regenerates .expo/types, but the runtime segment is a plain string.
      const onReset = (segments[segments.length - 1] as string) === 'reset-password'
      if (!onReset) router.replace('/(auth)/reset-password' as never)
      return
    }

    if (session && inAuthGroup) {
      // After login, route into the drawer (its default screen is the tabs).
      router.replace('/' as never)
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/login' as never)
    }
  }, [session, loading, segments, isRecovering])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1B4F72" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      {/* The drawer owns the post-login experience (drawer wraps the tabs). */}
      <Stack.Screen name="(drawer)" />
      {/* Create-club form (advisers/faculty). Sits beside the club/[id] routes;
          static "create" segment takes precedence over the dynamic [id]. */}
      <Stack.Screen name="club/create" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      {/* Club detail + nested action screens. Headers are configured inline on
          each screen so the title can be dynamic (e.g. the club's name). */}
      <Stack.Screen name="club/[id]/index" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/manage" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/attendance" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/record-attendance" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/announcements" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/finances" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/reports" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/dues" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/budget" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="club/[id]/events" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      {/* Faculty coordinator console — school-wide oversight (gated by role
          inside each screen). */}
      <Stack.Screen name="faculty/index" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="faculty/clubs" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      {/* Global moderation queues — adviser/faculty only, surfaced from the
          home dashboard Pending Approvals card pack. */}
      <Stack.Screen name="moderation/announcements" options={{ headerShown: true, headerBackTitle: 'Back' }} />
      <Stack.Screen name="moderation/reports" options={{ headerShown: true, headerBackTitle: 'Back' }} />
    </Stack>
  )
}

export default function RootLayout() {
  // Outer-to-inner:
  //  • GestureHandlerRootView — required at the root for drawer swipe gestures.
  //  • ErrorBoundary — catches any render error in the app and shows a friendly
  //    fallback instead of a blank screen.
  //  • AuthProvider — session/profile context for every screen.
  //  • RootLayoutNav — the actual Stack + auth-gate redirects.
  //  • <Toast /> sits as a SIBLING of the navigator so toasts overlay the
  //    whole UI regardless of which screen fired them.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </ErrorBoundary>
      <Toast />
    </GestureHandlerRootView>
  )
}
