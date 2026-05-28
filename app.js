import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { supabase } from './src/services/supabase'

export default function App() {
  const [status, setStatus] = useState('Connecting...')

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .limit(1)

        if (error) {
          setStatus('Connection Error: ' + error.message)
        } else {
          setStatus('✅ Connected to Supabase!')
        }
      } catch (err) {
        setStatus('Error: ' + err.message)
      }
    }

    testConnection()
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{status}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
  },
})