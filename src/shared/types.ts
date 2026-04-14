export type JiraContext = {
  issueKey: string
  issueUrl: string
  issueTitle: string
}

export type RecorderVideoVisibility = 'public' | 'private' | 'unlisted'
export type RecorderVideoSortOrder = 'asc' | 'desc'
export type RecorderVideoSortBy =
  | 'createdAt'
  | 'updatedAt'
  | 'title'
  | 'duration'
  | 'totalViews'
  | 'totalLikes'

export type RecorderVideo = {
  id: string
  title: string
  durationSeconds?: number
  createdAt?: string
  updatedAt?: string
  totalViews?: number
  totalLikes?: number
  tags?: string[]
  thumbnailUrl?: string
  shareUrl: string
  visibility?: RecorderVideoVisibility
  source?: 'recorder' | 'mock'
}

export type JiraSettings = {
  baseUrl: string
  email: string
  apiToken: string
  apiVersion: '2' | '3'
}

export type RecorderSettings = {
  baseUrl: string
  apiToken: string
  refreshToken?: string
  tokenExpiresAt?: number
  shareUrlTemplate: string
}

export type AuthTokens = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

export type Settings = {
  jira: JiraSettings
  recorder: RecorderSettings
}

export type SettingsPatch = {
  jira?: Partial<JiraSettings>
  recorder?: Partial<RecorderSettings>
}
