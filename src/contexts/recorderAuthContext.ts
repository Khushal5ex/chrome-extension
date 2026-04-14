import { createContext } from 'react'
import { type Settings } from '../shared/types'

export type RecorderAuthState = 'idle' | 'working'

export type RecorderAuthContextValue = {
  settings: Settings | null
  isLoading: boolean
  authState: RecorderAuthState
  recorderAuthReady: boolean
  recorderConfigured: boolean
  recorderSignedIn: boolean
  authWarning: string | null
  reloadSettings: () => Promise<void>
  signIn: () => Promise<string>
  signOut: () => Promise<string>
}

export const RecorderAuthContext = createContext<
  RecorderAuthContextValue | undefined
>(undefined)
