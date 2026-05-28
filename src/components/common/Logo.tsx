// ─────────────────────────────────────────────────────────────────────────────
// Logo — the Pampanga High School seal, rendered at any size.
//
// One component, two "looks":
//   • <Logo size={N} />              — just the circular seal (e.g. drawer header).
//   • <Logo size={N} showWordmark />  — seal + "Pampanga High School / Club System"
//                                       stacked below, centered. Use for auth screens
//                                       and About — the standard hero treatment.
//
// The image file lives at assets/images/school-logo.png. The user needs to
// drop the file there once; this component never touches the bytes.
//
// Design rule (Impeccable typography): when the wordmark sits below the
// image, the line spacing follows the type scale, NOT arbitrary pixels.
// ─────────────────────────────────────────────────────────────────────────────
import { useTheme } from '@/hooks/use-theme'
import React, { useMemo } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

type LogoProps = {
  size?: number          // diameter of the circular seal in pixels
  showWordmark?: boolean // whether to render the school name + "Club System" below
}

// require() is resolved at bundle time — the path is relative to THIS file.
// If the user hasn't dropped the PNG in yet, Metro will throw a clear "module
// not found" error at startup which is easier to debug than a silent miss.
const LOGO_SOURCE = require('../../../assets/images/school-logo.png')

const Logo = ({ size = 96, showWordmark = false }: LogoProps): React.JSX.Element => {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  return (
    <View style={styles.container}>
      <Image
        source={LOGO_SOURCE}
        // The image is a pre-rounded seal so we don't need an extra border-radius.
        style={{ width: size, height: size, resizeMode: 'contain' }}
        accessibilityLabel="Pampanga High School seal"
      />
      {showWordmark && (
        <View style={styles.wordmark}>
          <Text style={styles.schoolName}>Pampanga High School</Text>
          <Text style={styles.subBrand}>Club System</Text>
        </View>
      )}
    </View>
  )
}

export default Logo

const makeStyles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
    },
    wordmark: {
      alignItems: 'center',
      marginTop: t.space.md,
    },
    // Primary school identity — uses the body text color so it reads cleanly
    // on the warm-white background.
    schoolName: {
      fontSize: t.font.size.h3,
      lineHeight: t.font.lineHeight.h3,
      fontWeight: t.font.weight.bold,
      color: t.color.text,
      letterSpacing: t.font.tracking.tight,
    },
    // Secondary "Club System" line — smaller, in brand color so it reads as
    // a system label rather than the school's own name.
    subBrand: {
      fontSize: t.font.size.bodySm,
      lineHeight: t.font.lineHeight.bodySm,
      fontWeight: t.font.weight.semibold,
      color: t.color.brandPressed,
      letterSpacing: t.font.tracking.caps,
      textTransform: 'uppercase',
      marginTop: 2,
    },
  })
