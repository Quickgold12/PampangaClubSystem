// Tiny wrapper around react-native-toast-message so screens don't import the
// library directly. Centralising the call also lets us swap libraries later
// without changing every caller, and keeps the message API consistent (one
// "info" line, one optional "details" line).
//
// Use these for SUCCESS / INFO feedback after an action ("Saved", "Sent").
// Keep `Alert.alert` for:
//   • Destructive confirmations ("Delete?" with Cancel/Confirm)
//   • Errors that need to block until acknowledged
import Toast from 'react-native-toast-message'

export const toastSuccess = (text: string, details?: string): void => {
  Toast.show({
    type: 'success',
    text1: text,
    text2: details,
    position: 'bottom',
    visibilityTime: 2500,
  })
}

export const toastInfo = (text: string, details?: string): void => {
  Toast.show({
    type: 'info',
    text1: text,
    text2: details,
    position: 'bottom',
    visibilityTime: 2500,
  })
}
