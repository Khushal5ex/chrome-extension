import axios from 'axios'

/**
 * Recorder authentication helpers aligned with web-ui and auth API contracts.
 */

const DEFAULT_AUTH_API_URL = 'https://authentication-api-beta.truvideo.com/v1'
const DEFAULT_ACCOUNT_UID = '3c0095ab-646d-4e50-b386-a9eff2aaca17'
const DEFAULT_SUBACCOUNT_UID = 'da5b0803-327a-4deb-836e-d27767fc7dd5'
const DEFAULT_PRODUCT_KEY = 'TRUVIDEO_RECORDER'

const isConfigured = (value: string | undefined | null): value is string =>
  typeof value === 'string' && value.trim().length > 0

const normalizeApiBase = (value: string) => value.replace(/\/+$/, '')

const readFirstParam = (params: URLSearchParams, keys: string[]) => {
  for (const key of keys) {
    const value = params.get(key)
    if (isConfigured(value)) {
      return value ?? undefined
    }
  }
  return undefined
}

export type RecorderRedirectResult = {
  token?: string
  refreshToken?: string
  code?: string
  error?: string
  errorDescription?: string
}

export const getAuthApiUrl = () =>
  normalizeApiBase(import.meta.env.VITE_AUTH_API_URL || DEFAULT_AUTH_API_URL)

export const isRecorderAuthConfigured = () => isConfigured(getAuthApiUrl())

/**
 * Build OAuth Google login URL.
 * Contract: /auth/google?accountUID&subAccountUID&productKey&redirectUrl
 */
export const buildRecorderAuthUrl = (redirectUri: string) => {
  const authUrl = getAuthApiUrl()
  if (!isConfigured(authUrl)) return null

  const accountUID = import.meta.env.VITE_ACCOUNT_UID || DEFAULT_ACCOUNT_UID
  const subAccountUID =
    import.meta.env.VITE_SUBACCOUNT_UID || DEFAULT_SUBACCOUNT_UID
  const productKey = import.meta.env.VITE_PRODUCT_KEY || DEFAULT_PRODUCT_KEY

  const url = new URL(`${authUrl}/auth/google`)
  url.searchParams.set('accountUID', accountUID)
  url.searchParams.set('subAccountUID', subAccountUID)
  url.searchParams.set('productKey', productKey)
  url.searchParams.set('redirectUrl', redirectUri)
  return url.toString()
}

/**
 * Parse auth callback URL coming from chrome.identity.launchWebAuthFlow.
 * Supports both query and hash params because providers can return either.
 */
export const parseRecorderRedirect = (
  redirectUrl: string | null | undefined,
): RecorderRedirectResult => {
  if (!redirectUrl) {
    return { error: 'No redirect URL returned.' }
  }

  const url = new URL(redirectUrl)
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

  const token =
    readFirstParam(query, ['accessToken', 'access_token', 'token']) ??
    readFirstParam(hash, ['accessToken', 'access_token', 'token'])

  const refreshToken =
    readFirstParam(query, ['refreshToken', 'refresh_token']) ??
    readFirstParam(hash, ['refreshToken', 'refresh_token'])

  const code =
    readFirstParam(query, ['code']) ?? readFirstParam(hash, ['code'])

  const error =
    readFirstParam(query, ['error']) ?? readFirstParam(hash, ['error'])

  const errorDescription =
    readFirstParam(query, ['error_description']) ??
    readFirstParam(hash, ['error_description'])

  return {
    token,
    refreshToken,
    code,
    error,
    errorDescription,
  }
}

/**
 * Refresh access token using auth API:
 * POST /auth/refresh { token: refreshToken }
 */
export const refreshRecorderToken = async (refreshToken: string) => {
  if (!isConfigured(refreshToken)) {
    throw new Error('Refresh token is missing.')
  }

  const response = await axios.post(
    `${getAuthApiUrl()}/auth/refresh`,
    {
      token: refreshToken,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    },
  )

  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Refresh token expired or invalid')
    }
    throw new Error(`Token refresh failed (${response.status})`)
  }

  const data = response.data as {
    token?: string
    accessToken?: string
    access_token?: string
    refreshToken?: string
    refresh_token?: string
  }

  const accessToken = data.token ?? data.accessToken ?? data.access_token
  const rotatedRefreshToken = data.refreshToken ?? data.refresh_token

  if (!isConfigured(accessToken)) {
    throw new Error('Access token missing in refresh response.')
  }

  return {
    accessToken,
    refreshToken: rotatedRefreshToken,
  }
}
