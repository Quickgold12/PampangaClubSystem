// ─────────────────────────────────────────────────────────────────────────────
// Drawer layout — wraps the bottom-tabs navigator + side screens.
//
// How navigation looks to the user:
//   • Tap the ☰ icon in the header → drawer slides in from the left.
//   • Drawer items:
//       Home (= the tabs navigator: Home / Clubs / Requests / Explore)
//       Profile
//       About
//       Sign Out (custom button — not a screen, just an action)
//
// Why the drawer wraps tabs (not the other way round): bottom tabs are the
// primary "where am I in the app" affordance; the drawer is for things that
// happen rarely (Profile/About/Sign Out). This is the standard mobile pattern.
// ─────────────────────────────────────────────────────────────────────────────
import Logo from '@/components/common/Logo'
import { useAuth } from '@/context/AuthContext'
import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications'
import { useTheme } from '@/hooks/use-theme'
import { Image } from 'expo-image'
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
} from '@react-navigation/drawer'
import { router } from 'expo-router'
import { Drawer } from 'expo-router/drawer'
import React, { useMemo } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'

export default function DrawerLayout() {
  const theme = useTheme()
  // Start realtime notifications for the whole authenticated session. Mounted
  // here (not in the root layout) so it only runs when signed in and tears
  // down on sign-out.
  useRealtimeNotifications()

  return (
    <Drawer
      // The drawer header (with ☰) is always visible. Each screen can still
      // override its own title via Drawer.Screen options below.
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.text,
        drawerStyle: { backgroundColor: theme.color.surface },
        drawerActiveTintColor: theme.color.brandPressed,
        drawerActiveBackgroundColor: theme.color.brandSubtle,
        drawerInactiveTintColor: theme.color.textMuted,
      }}
      drawerContent={(props) => <CustomDrawerContent {...props} />}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{ title: 'Home', drawerLabel: 'Home' }}
      />
      <Drawer.Screen
        name="profile"
        options={{ title: 'Profile', drawerLabel: 'Profile' }}
      />
      <Drawer.Screen
        name="about"
        options={{ title: 'About', drawerLabel: 'About' }}
      />
    </Drawer>
  )
}

// Custom drawer content: standard item list on top + a user info block at the
// bottom with a Sign Out button. Sign Out is a custom DrawerItem (not a
// Drawer.Screen) because it's an action, not a destination.
function CustomDrawerContent(props: DrawerContentComponentProps) {
  const theme = useTheme()
  const styles = useMemo(() => makeDrawerStyles(theme), [theme])
  const { profile, signOut } = useAuth()

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will be returned to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          // Root layout's auth gate sees session=null and routes back to /login.
        },
      },
    ])
  }

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.container}>
      {/* App identity strip at the top of the drawer. Logo + wordmark stacks
          horizontally — keeps the strip compact so the menu items below don't
          get pushed down too far. */}
      <View style={styles.brandHeader}>
        <Logo size={48} />
        <View style={styles.brandText}>
          <Text style={styles.brandEyebrow}>Pampanga High School</Text>
          <Text style={styles.brandTitle}>Club System</Text>
        </View>
      </View>

      {/* The standard item list (Home/Profile/About) from Drawer.Screen above. */}
      <DrawerItemList {...props} />

      {/* Spacer pushes the footer to the bottom. */}
      <View style={styles.spacer} />

      {/* Current user info — avatar + name + role, so the footer doubles as a
          "who am I logged in as?" indicator. */}
      {profile && (
        <View style={styles.userBlock}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.userAvatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
              <Text style={styles.userAvatarInitials}>{drawerInitials(profile.full_name)}</Text>
            </View>
          )}
          <View style={styles.userTextBlock}>
            <Text style={styles.userName} numberOfLines={1}>
              {profile.full_name}
            </Text>
            <Text style={styles.userRole}>{formatRole(profile.role)}</Text>
          </View>
        </View>
      )}

      {/* Faculty-only entry to the school-wide oversight console. Rendered as
          a custom DrawerItem (not a Drawer.Screen) so we can show it
          conditionally and route to the /faculty stack outside the drawer. */}
      {profile?.role === 'faculty_coordinator' && (
        <DrawerItem
          label="School Overview"
          onPress={() => {
            props.navigation.closeDrawer()
            router.push('/faculty' as never)
          }}
          labelStyle={styles.facultyLabel}
        />
      )}

      {/* Sign Out as a DrawerItem so it picks up the same styling as the rest. */}
      <DrawerItem
        label="Sign Out"
        onPress={handleSignOut}
        labelStyle={styles.signOutLabel}
      />
    </DrawerContentScrollView>
  )
}

// First-letters initials for the avatar placeholder ("Elijah Gonzales" → "EG").
const drawerInitials = (fullName: string): string =>
  fullName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

// Maps the raw role enum to a human-readable label for the drawer footer.
const formatRole = (role: string): string => {
  const map: Record<string, string> = {
    student_member: 'Student',
    club_officer: 'Club Officer',
    adviser: 'Adviser',
    faculty_coordinator: 'Faculty Coordinator',
  }
  return map[role] ?? role
}

const makeDrawerStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 0,
    },
    // Horizontal strip — logo on the left, two-line text on the right.
    brandHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.xl,
      paddingBottom: t.space.lg,
      borderBottomWidth: 1,
      borderBottomColor: t.color.border,
      marginBottom: t.space.sm,
    },
    // Right side of the brand strip — holds the two text lines.
    brandText: {
      flex: 1,
    },
    brandEyebrow: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    brandTitle: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
    },
    spacer: {
      flex: 1,
      minHeight: t.space['2xl'],
    },
    // Now a horizontal row: avatar + (name / role) text block.
    userBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.color.border,
    },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.surfaceMuted,
    },
    userAvatarPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.color.brand,
    },
    userAvatarInitials: {
      fontSize: t.font.size.bodySm,
      fontWeight: t.font.weight.bold,
      color: t.color.brandPressed,
    },
    userTextBlock: {
      flex: 1,
    },
    userName: {
      fontSize: t.font.size.body,
      fontWeight: t.font.weight.semibold,
      color: t.color.text,
    },
    userRole: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
    },
    signOutLabel: {
      color: t.color.danger,
      fontWeight: t.font.weight.semibold,
    },
    // Faculty console link — brand-colored to stand out as an elevated action.
    facultyLabel: {
      color: t.color.brandPressed,
      fontWeight: t.font.weight.semibold,
    },
  })
