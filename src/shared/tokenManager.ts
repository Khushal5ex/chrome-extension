import { type AuthTokens } from './types'

/**
 * Token expiry threshold - refresh token 2 minutes before expiration
 */
const TOKEN_EXPIRY_THRESHOLD_MS = 2 * 60 * 1000

/**
 * Decode JWT payload without external dependencies
 */
function decodeJWT(token: string): { exp?: number } | null {
  try {
    const base64Payload = token.split('.')[1]?.trim()
    if (!base64Payload) return null

    const normalized = base64Payload.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    const padded =
      padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=')
    const decodedPayload = globalThis.atob(padded)

    return JSON.parse(decodedPayload)
  } catch {
    return null
  }
}

/**
 * Get token expiration time in milliseconds
 */
function getTokenExpiration(token: string): number | null {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp) return null
  return payload.exp * 1000 // Convert seconds to milliseconds
}

/**
 * Check if token is expired or will expire soon
 */
export function isTokenExpiring(
  token: string,
  thresholdMs = TOKEN_EXPIRY_THRESHOLD_MS
): boolean {
  const expiration = getTokenExpiration(token)
  if (!expiration) return true // If we can't decode, consider it expired

  const now = Date.now()
  return now >= expiration - thresholdMs
}

/**
 * Calculate token expiry timestamp
 */
export function getTokenExpiryTime(token: string): number | null {
  return getTokenExpiration(token)
}

/**
 * Validate if token exists and is not expired
 */
export function isTokenValid(token: string | null | undefined): boolean {
  if (!token) return false
  if (isTokenExpiring(token)) return false
  return true
}

/**
 * Extract token expiry from tokens object
 */
export function calculateExpiresAt(tokens: AuthTokens): number | undefined {
  if (tokens.expiresAt) {
    return tokens.expiresAt
  }
  const expiryTime = getTokenExpiryTime(tokens.accessToken)
  return expiryTime || undefined
}
