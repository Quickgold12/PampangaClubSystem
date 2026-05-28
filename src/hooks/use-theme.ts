// Returns the active design tokens based on system color scheme.
// Components call this in their render and pass the returned `theme` to a
// `useMemo`-cached StyleSheet factory so styles update on theme change.

import { darkTheme, lightTheme, type Theme } from '@/constants'
import { useColorScheme } from '@/hooks/use-color-scheme'

export const useTheme = (): Theme => {
  const scheme = useColorScheme()
  return scheme === 'dark' ? darkTheme : lightTheme
}
