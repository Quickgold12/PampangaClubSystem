// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary — catches render errors anywhere below it in the tree and
// shows a friendly fallback instead of a blank white screen.
//
// React error boundaries must be class components (the function-component
// equivalents only exist via third-party libs). The wrapped tree continues to
// render until something throws; on throw we display a "Something went wrong"
// card with a Try Again button that resets the boundary.
//
// The actual error is also logged to console so it shows up in Metro for
// debugging. In production builds you'd pipe `componentDidCatch` into Sentry
// or similar — left as a TODO comment to make that swap easy.
// ─────────────────────────────────────────────────────────────────────────────
import React, { ErrorInfo, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null }

  // Called when a descendant throws during render. Returning new state flips
  // us into the fallback UI on the next render.
  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unknown error occurred.',
    }
  }

  // Side-effect hook: log the error somewhere useful. Console for now; swap to
  // Sentry / a remote logger when going to production.
  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught', error, info.componentStack)
    // TODO: forward to error tracking, e.g. Sentry.captureException(error)
  }

  // Reset so the wrapped tree gets another chance after the user taps Try Again.
  private reset = () => this.setState({ hasError: false, message: null })

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>{this.state.message}</Text>
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    )
  }
}

// Plain styles (no `useTheme` — this must render even if the theme provider
// itself crashed, so we use hard-coded warm-friendly values).
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#FFFBF2',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#171717',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#525252',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: '#D97706' },
  buttonText: { color: '#1F1300', fontWeight: '600', fontSize: 15 },
})
