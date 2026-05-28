// ─────────────────────────────────────────────────────────────────────────────
// About screen — static info + a brief "how to use" for each role.
//
// Lives in the drawer so it's discoverable but out of the main flow. Content
// is static; if it ever needs to change between builds, edit this file.
// ─────────────────────────────────────────────────────────────────────────────
import Logo from '@/components/common/Logo'
import { useTheme } from '@/hooks/use-theme'
import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

export default function AboutScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Logo with full wordmark — About is the canonical place to show the
          school identity in full. Hero treatment, centered. */}
      <View style={styles.hero}>
        <Logo size={120} showWordmark />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>About this app</Text>
        <Text style={styles.subtitle}>Club Management System</Text>
      </View>

      <Section title="What it does">
        <Text style={styles.body}>
          A single place for students, club officers, advisers, and faculty
          coordinators to manage school organizations — from joining a club to
          tracking who attended last week&apos;s meeting.
        </Text>
      </Section>

      <Section title="If you're a student">
        <Bullet text="Open Clubs to browse every organization." />
        <Bullet text="Tap a club to see its description, members, and adviser." />
        <Bullet text='Use "Request to Join" — your request goes to the officers.' />
        <Bullet text="Track the status of your applications on the Requests tab." />
      </Section>

      <Section title="If you're a club officer or adviser">
        <Bullet text="The Requests tab becomes your approvals queue." />
        <Bullet text="Open your club to access Manage Members, Attendance, and Record Attendance." />
        <Bullet text="Members can be added by email, promoted, demoted, or removed." />
        <Bullet text="Record attendance per event; history and per-member summaries update automatically." />
      </Section>

      <Section title="Privacy">
        <Text style={styles.body}>
          Your data is stored in your school&apos;s Supabase project. Only
          users in your school can see it, and database rules limit what each
          role can read and write.
        </Text>
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Version 1.0</Text>
      </View>
    </ScrollView>
  )
}

// Section wrapper — same shape used elsewhere; inlined to avoid a new component file.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  )
}

// Bullet point row — leading dot + body text. Padding-vertical keeps lines breathable.
function Bullet({ text }: { text: string }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    // Logo + wordmark hero, centered, sits above the page title.
    hero: {
      alignItems: 'center',
      marginTop: t.space.md,
      marginBottom: t.space.xl,
    },
    header: {
      alignItems: 'center',
      marginBottom: t.space.xl,
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
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    subtitle: {
      fontSize: t.font.size.body,
      color: t.color.textMuted,
    },
    section: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      marginBottom: t.space.md,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    sectionLabel: {
      fontSize: t.font.size.caption,
      color: t.color.textMuted,
      fontWeight: t.font.weight.semibold,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginBottom: t.space.sm,
    },
    body: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
    },
    bulletRow: {
      flexDirection: 'row',
      paddingVertical: t.space.xs,
      gap: t.space.sm,
    },
    bulletDot: {
      fontSize: t.font.size.body,
      color: t.color.brandPressed,
      fontWeight: t.font.weight.bold,
    },
    bulletText: {
      flex: 1,
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
    },
    footer: {
      alignItems: 'center',
      marginTop: t.space.lg,
    },
    footerText: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
    },
  })
