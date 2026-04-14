import { type Settings, type SettingsPatch } from './types'

const SETTINGS_KEY = 'truvideo_settings'
const DEFAULT_RECORDER_API_URL = import.meta.env.VITE_API_URL || ''
const DEFAULT_JIRA_BASE_URL = import.meta.env.VITE_JIRA_BASE_URL || ''
const DEFAULT_SHARE_URL_TEMPLATE = import.meta.env.VITE_SHARE_URL_TEMPLATE || ''

export const defaultSettings: Settings = {
  jira: {
    baseUrl: DEFAULT_JIRA_BASE_URL,
    email: '',
    apiToken: '',
    apiVersion: '3',
  },
  recorder: {
    baseUrl: DEFAULT_RECORDER_API_URL,
    apiToken: '',
    refreshToken: undefined,
    tokenExpiresAt: undefined,
    shareUrlTemplate: DEFAULT_SHARE_URL_TEMPLATE,
  },
}

const getChromeStorageArea = () =>
  typeof globalThis.chrome !== 'undefined' ? globalThis.chrome.storage?.local : undefined

const hasChromeStorage = () => !!getChromeStorageArea()

const safeParse = (raw: string | null) => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Settings
  } catch {
    return null
  }
}

const mergeSettings = (partial?: Partial<Settings> | null): Settings => ({
  jira: {
    ...defaultSettings.jira,
    ...(partial?.jira ?? {}),
  },
  recorder: {
    ...defaultSettings.recorder,
    ...(partial?.recorder ?? {}),
  },
})

export async function getSettings(): Promise<Settings> {
  const area = getChromeStorageArea()
  if (area) {
    const stored = await area.get(SETTINGS_KEY)
    return mergeSettings(stored[SETTINGS_KEY] as Partial<Settings> | undefined)
  }

  if (typeof localStorage !== 'undefined') {
    return mergeSettings(safeParse(localStorage.getItem(SETTINGS_KEY)))
  }

  return defaultSettings
}

export async function setSettings(settings: Settings): Promise<Settings> {
  const next = mergeSettings(settings)
  const area = getChromeStorageArea()
  if (area) {
    await area.set({ [SETTINGS_KEY]: next })
    return next
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }

  return next
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings()
  const next = mergeSettings({
    jira: {
      ...current.jira,
      ...(patch.jira ?? {}),
    },
    recorder: {
      ...current.recorder,
      ...(patch.recorder ?? {}),
    },
  })
  return setSettings(next)
}

export function watchSettings(onChange: (settings: Settings) => void): () => void {
  if (hasChromeStorage()) {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== 'local') {
        return
      }
      const change = changes[SETTINGS_KEY]
      if (!change) return
      onChange(mergeSettings(change.newValue as Partial<Settings> | undefined))
    }

    globalThis.chrome.storage.onChanged.addListener(listener)
    return () => globalThis.chrome.storage.onChanged.removeListener(listener)
  }

  return () => {}
}

export const settingsKey = SETTINGS_KEY
