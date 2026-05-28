// Runtime environment helpers.
//
// isExpoGo — true when running inside the Expo Go sandbox (vs a dev/standalone
// build). Used to gate native-only features (notifications) that don't work in
// Expo Go on SDK 53+. `storeClient` is Expo Go; `standalone`/`bare` are real
// builds.
import Constants, { ExecutionEnvironment } from 'expo-constants'

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient
