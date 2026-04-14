import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  buildRecorderAuthUrl,
  isRecorderAuthConfigured,
  parseRecorderRedirect,
} from '../shared/recorderAuth'
import {
  RecorderAuthContext,
  type RecorderAuthContextValue,
  type RecorderAuthState,
} from './recorderAuthContext'
import { getSettings, updateSettings, watchSettings } from '../shared/storage'
import { getTokenExpiryTime, isTokenValid } from '../shared/tokenManager'
import { type Settings } from '../shared/types'

const launchWebAuthFlow = (url: string) =>
  new Promise<string>((resolve, reject) => {
    if (!globalThis.chrome?.identity?.launchWebAuthFlow) {
      reject(new Error('Chrome identity API is not available.'))
      return
    }

    globalThis.chrome.identity.launchWebAuthFlow(
      { url, interactive: true },
      (redirectUrl) => {
        const error = globalThis.chrome.runtime.lastError
        if (error) {
          reject(new Error(error.message))
          return
        }
        if (!redirectUrl) {
          reject(new Error('No redirect URL returned.'))
          return
        }
        resolve(redirectUrl)
      },
    )
  })

const sanitizeRecorderTokenState = async (settingsValue: Settings) => {
  if (!settingsValue.recorder.apiToken) {
    return { settings: settingsValue, warning: null as string | null }
  }

  if (isTokenValid(settingsValue.recorder.apiToken)) {
    return { settings: settingsValue, warning: null as string | null }
  }

  const cleared = await updateSettings({
    recorder: {
      apiToken: '',
      refreshToken: undefined,
      tokenExpiresAt: undefined,
    },
  })

  return {
    settings: cleared,
    warning: 'Your authentication token has expired. Please sign in again.',
  }
}

export function RecorderAuthProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authState, setAuthState] = useState<RecorderAuthState>('idle')
  const [authWarning, setAuthWarning] = useState<string | null>(null)

  const reloadSettings = async () => {
    const settingsValue = await getSettings()
    const sanitized = await sanitizeRecorderTokenState(settingsValue)
    setSettings(sanitized.settings)
    setAuthWarning(sanitized.warning)
  }

  useEffect(() => {
    const load = async () => {
      try {
        await reloadSettings()
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const unsubscribe = watchSettings((next) => {
      setSettings(next)
    })
    return unsubscribe
  }, [])

  const signIn = async () => {
    if (!globalThis.chrome?.identity?.getRedirectURL) {
      throw new Error('Chrome identity API is not available.')
    }

    if (!isRecorderAuthConfigured()) {
      throw new Error('Recorder auth URL not configured.')
    }

    setAuthState('working')
    setAuthWarning(null)
    try {
      const redirectUri = globalThis.chrome.identity.getRedirectURL('recorder')
      const authUrl = buildRecorderAuthUrl(redirectUri)
      if (!authUrl) {
        throw new Error('Recorder auth URL not configured.')
      }

      const redirectUrl = await launchWebAuthFlow(authUrl)
      const result = parseRecorderRedirect(redirectUrl)
      if (result.error) {
        const detail = result.errorDescription
          ? ` (${result.errorDescription})`
          : ''
        throw new Error(`Login failed: ${result.error}${detail}`)
      }

      const accessToken = result.token
      const refreshToken = result.refreshToken
      if (!accessToken) {
        if (result.code) {
          throw new Error(
            'Auth callback returned code instead of tokens. Configure auth API to return accessToken/refreshToken for extension redirect URI.',
          )
        }
        throw new Error('No token returned from Recorder login.')
      }

      const expiresAt = getTokenExpiryTime(accessToken) || undefined
      const next = await updateSettings({
        recorder: {
          apiToken: accessToken,
          refreshToken,
          tokenExpiresAt: expiresAt,
        },
      })
      setSettings(next)
      return 'Signed in to Recorder.'
    } finally {
      setAuthState('idle')
    }
  }

  const signOut = async () => {
    const next = await updateSettings({
      recorder: {
        apiToken: '',
        refreshToken: undefined,
        tokenExpiresAt: undefined,
      },
    })
    setSettings(next)
    return 'Signed out from Recorder.'
  }

  const value = useMemo<RecorderAuthContextValue>(
    () => ({
      settings,
      isLoading,
      authState,
      recorderAuthReady: isRecorderAuthConfigured(),
      recorderConfigured: !!settings?.recorder.baseUrl,
      recorderSignedIn: !!settings?.recorder.apiToken,
      authWarning,
      reloadSettings,
      signIn,
      signOut,
    }),
    [authState, authWarning, isLoading, settings],
  )

  return (
    <RecorderAuthContext.Provider value={value}>
      {children}
    </RecorderAuthContext.Provider>
  )
}
