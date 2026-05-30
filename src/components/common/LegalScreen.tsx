// ─────────────────────────────────────────────────────────────────────────────
// LegalScreen — shared layout for static legal documents (Privacy Policy,
// Terms of Service). Data-driven so each document is just a title + an array of
// { heading, body[] } sections; keeps the two route files thin and identical
// in styling.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import { Stack } from 'expo-router'
import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

export type LegalSection = {
  heading: string
  // Each string is rendered as its own paragraph. Prefix a line with "• " to
  // render it as a bullet.
  body: string[]
}

type Props = {
  title: string
  lastUpdated: string
  intro?: string
  sections: LegalSection[]
}

export default function LegalScreen({ title, lastUpdated, intro, sections }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  return (
    <>
      <Stack.Screen options={{ title, headerShown: true, headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.updated}>Last updated: {lastUpdated}</Text>
        {intro ? <Text style={styles.intro}>{intro}</Text> : null}

        {sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            {s.body.map((line, i) => {
              const isBullet = line.startsWith('• ')
              return (
                <Text key={i} style={isBullet ? styles.bullet : styles.paragraph}>
                  {line}
                </Text>
              )
            })}
          </View>
        ))}
      </ScrollView>
    </>
  )
}

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.space.xl,
      backgroundColor: t.color.background,
    },
    title: {
      fontSize: t.font.size.h2,
      lineHeight: t.font.lineHeight.h2,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.xs,
    },
    updated: {
      fontSize: t.font.size.caption,
      color: t.color.textSubtle,
      marginBottom: t.space.lg,
    },
    intro: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.textMuted,
      marginBottom: t.space.lg,
    },
    section: {
      marginBottom: t.space.lg,
    },
    heading: {
      fontSize: t.font.size.lead,
      lineHeight: t.font.lineHeight.lead,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      marginBottom: t.space.sm,
    },
    paragraph: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
      marginBottom: t.space.sm,
    },
    bullet: {
      fontSize: t.font.size.body,
      lineHeight: t.font.lineHeight.body,
      color: t.color.text,
      marginBottom: t.space.xs,
      paddingLeft: t.space.sm,
    },
  })
