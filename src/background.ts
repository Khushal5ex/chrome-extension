import { type AxiosResponse } from 'axios'
import {
  buildAdfComment,
  buildPlainComment,
  mergeAdfDescriptionWithVideos,
  mergePlainDescriptionWithVideos,
} from './shared/jira'
import {
  type AttachVideosResponse,
  type JiraAttachTarget,
  type RecorderListFilters,
  type RecorderListMessage,
  type RecorderListPagination,
  type RecorderListResponse,
  type StoreJiraContextMessage,
} from './shared/messages'
import { mockVideos } from './shared/mockVideos'
import { getSettings, updateSettings } from './shared/storage'
import { refreshRecorderToken } from './shared/recorderAuth'
import { JiraApi, parseJiraErrorMessage } from './shared/services/jiraApi'
import { RecorderApi } from './shared/services/recorderApi'
import { getTokenExpiryTime } from './shared/tokenManager'
import {
  type JiraContext,
  type RecorderVideo,
  type RecorderVideoSortBy,
  type RecorderVideoSortOrder,
  type RecorderVideoVisibility,
} from './shared/types'

const SESSION_CONTEXT_KEY = 'jiraContext'
const RECORDER_LIST_LIMIT = 50
const RECORDER_DEFAULT_PAGE = 1
const RECORDER_VISIBILITY_VALUES: RecorderVideoVisibility[] = [
  'public',
  'private',
  'unlisted',
]
const RECORDER_SORT_BY_VALUES: RecorderVideoSortBy[] = [
  'createdAt',
  'updatedAt',
  'title',
  'duration',
  'totalViews',
  'totalLikes',
]
const RECORDER_SORT_ORDER_VALUES: RecorderVideoSortOrder[] = ['asc', 'desc']

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const buildRecorderApiErrorMessage = (
  status: number,
  scope: 'list' | 'update',
) => {
  if (status === 401 || status === 403) {
    const action =
      scope === 'list'
        ? 'load videos'
        : 'sync metadata to the selected videos'
    return `Recorder sign-in expired. Use "Sign in with Google" above, then retry to ${action}.`
  }

  if (status === 404) {
    return 'Recorder API endpoint not found. Verify Recorder API base URL in Settings.'
  }

  if (status === 429) {
    return 'Recorder rate limit reached. Wait a moment and try again.'
  }

  if (status >= 500) {
    return 'Recorder service is temporarily unavailable. Please try again.'
  }

  return `Recorder request failed (HTTP ${status}).`
}

const buildJiraApiErrorMessage = (
  status: number,
  detail: string | undefined,
  scope: 'comment' | 'description',
) => {
  const objectLabel = scope === 'comment' ? 'Jira comment' : 'Jira description'

  if (status === 400) {
    return detail
      ? `Unable to update ${objectLabel}: ${detail}.`
      : `Unable to update ${objectLabel}. Verify issue details and try again.`
  }

  if (status === 401 || status === 403) {
    return 'Jira authorization failed. Check Jira credentials in Settings.'
  }

  if (status === 404) {
    return 'Jira issue not found. Open a valid issue and try again.'
  }

  if (status === 429) {
    return 'Jira rate limit reached. Wait a moment and try again.'
  }

  if (status >= 500) {
    return 'Jira service is temporarily unavailable. Please try again.'
  }

  if (detail) {
    return `Unable to update ${objectLabel}: ${detail}.`
  }

  return `Unable to update ${objectLabel} (HTTP ${status}).`
}

const readListFromPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload

  if (!payload || typeof payload !== 'object') return []

  const data = payload as { videos?: unknown; objects?: unknown; items?: unknown }
  if (Array.isArray(data.videos)) return data.videos
  if (Array.isArray(data.objects)) return data.objects
  if (Array.isArray(data.items)) return data.items
  return []
}

const toPositiveInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return undefined
}

const toNonNegativeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed
    }
  }

  return undefined
}

const normalizeSearchTerm = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const normalizeVisibility = (
  value: unknown,
): RecorderVideoVisibility | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.toLowerCase().trim()
  return RECORDER_VISIBILITY_VALUES.includes(
    normalized as RecorderVideoVisibility,
  )
    ? (normalized as RecorderVideoVisibility)
    : undefined
}

const normalizeTagValues = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }

  const unique = Array.from(
    new Set(
      value
        .map((item) =>
          typeof item === 'string' ? item.trim() : String(item ?? '').trim(),
        )
        .filter(Boolean),
    ),
  )

  return unique.length ? unique : undefined
}

const normalizeSortBy = (value: unknown): RecorderVideoSortBy => {
  if (typeof value !== 'string') {
    return 'createdAt'
  }

  const normalized = value.trim() as RecorderVideoSortBy
  return RECORDER_SORT_BY_VALUES.includes(normalized)
    ? normalized
    : 'createdAt'
}

const normalizeSortOrder = (value: unknown): RecorderVideoSortOrder => {
  if (typeof value !== 'string') {
    return 'desc'
  }

  const normalized = value.trim().toLowerCase() as RecorderVideoSortOrder
  return RECORDER_SORT_ORDER_VALUES.includes(normalized) ? normalized : 'desc'
}

type NormalizedRecorderListFilters = {
  page: number
  size: number
  searchTerm?: string
  visibility?: RecorderVideoVisibility
  tags?: string[]
  sortBy: RecorderVideoSortBy
  sortOrder: RecorderVideoSortOrder
}

const normalizeListFilters = (
  filters: RecorderListFilters | undefined,
): NormalizedRecorderListFilters => {
  const page = toPositiveInteger(filters?.page) ?? RECORDER_DEFAULT_PAGE
  const requestedSize = toPositiveInteger(filters?.size) ?? RECORDER_LIST_LIMIT
  const size = Math.min(requestedSize, RECORDER_LIST_LIMIT)

  return {
    page,
    size,
    searchTerm: normalizeSearchTerm(filters?.searchTerm),
    visibility: normalizeVisibility(filters?.visibility),
    tags: normalizeTagValues(filters?.tags),
    sortBy: normalizeSortBy(filters?.sortBy),
    sortOrder: normalizeSortOrder(filters?.sortOrder),
  }
}

const readPaginationFromPayload = (
  payload: unknown,
): {
  total?: number
  page?: number
  size?: number
  totalPages?: number
} => {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const data = payload as {
    total?: unknown
    page?: unknown
    size?: unknown
    pagination?: unknown
  }

  const pagination =
    data.pagination && typeof data.pagination === 'object'
      ? (data.pagination as {
          totalItems?: unknown
          currentPage?: unknown
          pageSize?: unknown
          totalPages?: unknown
        })
      : undefined

  return {
    total: toNonNegativeInteger(data.total ?? pagination?.totalItems),
    page: toPositiveInteger(data.page ?? pagination?.currentPage),
    size: toPositiveInteger(data.size ?? pagination?.pageSize),
    totalPages: toPositiveInteger(pagination?.totalPages),
  }
}

const buildPagination = (data: {
  page: number
  size: number
  total: number
  totalPages?: number
}): RecorderListPagination => {
  const total = Math.max(0, data.total)
  const totalPages =
    data.totalPages && data.totalPages > 0
      ? data.totalPages
      : Math.max(1, Math.ceil(total / data.size))
  const page = Math.min(Math.max(data.page, 1), totalPages)

  return {
    page,
    size: data.size,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}

const applyVideoFilters = (
  videos: RecorderVideo[],
  filters: NormalizedRecorderListFilters,
): RecorderVideo[] => {
  return videos.filter((video) => {
    if (filters.searchTerm) {
      const searchValue = filters.searchTerm.toLowerCase()
      const searchable = `${video.title} ${video.id}`.toLowerCase()
      if (!searchable.includes(searchValue)) {
        return false
      }
    }

    if (filters.visibility && video.visibility !== filters.visibility) {
      return false
    }

    if (filters.tags?.length) {
      const videoTags = new Set(
        (video.tags ?? [])
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
      )

      const hasTagMatch = filters.tags.some((tag) =>
        videoTags.has(tag.toLowerCase()),
      )

      if (!hasTagMatch) {
        return false
      }
    }

    return true
  })
}

const compareNumbers = (
  left: number | undefined,
  right: number | undefined,
): number => {
  const leftValue = Number.isFinite(left) ? Number(left) : 0
  const rightValue = Number.isFinite(right) ? Number(right) : 0
  return leftValue - rightValue
}

const compareDates = (
  left: string | undefined,
  right: string | undefined,
): number => {
  const leftTime = left ? new Date(left).getTime() : 0
  const rightTime = right ? new Date(right).getTime() : 0
  return compareNumbers(leftTime, rightTime)
}

const applyVideoSorting = (
  videos: RecorderVideo[],
  filters: NormalizedRecorderListFilters,
): RecorderVideo[] => {
  const multiplier = filters.sortOrder === 'desc' ? -1 : 1

  return [...videos].sort((left, right) => {
    let base = 0

    switch (filters.sortBy) {
      case 'title':
        base = left.title.localeCompare(right.title, undefined, {
          sensitivity: 'base',
        })
        break
      case 'duration':
        base = compareNumbers(left.durationSeconds, right.durationSeconds)
        break
      case 'totalViews':
        base = compareNumbers(left.totalViews, right.totalViews)
        break
      case 'totalLikes':
        base = compareNumbers(left.totalLikes, right.totalLikes)
        break
      case 'updatedAt':
        base = compareDates(left.updatedAt, right.updatedAt)
        break
      case 'createdAt':
      default:
        base = compareDates(left.createdAt, right.createdAt)
        break
    }

    if (base !== 0) {
      return base * multiplier
    }

    return left.id.localeCompare(right.id) * multiplier
  })
}

const refreshStoredRecorderToken = async (): Promise<string | null> => {
  try {
    const settings = await getSettings()
    const currentRefreshToken = settings.recorder.refreshToken
    if (!currentRefreshToken) {
      return null
    }

    const refreshed = await refreshRecorderToken(currentRefreshToken)
    const expiresAt = getTokenExpiryTime(refreshed.accessToken) ?? undefined

    await updateSettings({
      recorder: {
        apiToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || currentRefreshToken,
        tokenExpiresAt: expiresAt,
      },
    })

    return refreshed.accessToken
  } catch (error) {
    console.error('[AUTH] Recorder token refresh failed:', error)
    await updateSettings({
      recorder: {
        apiToken: '',
        refreshToken: undefined,
        tokenExpiresAt: undefined,
      },
    })
    return null
  }
}

const fetchRecorderWithRefresh = async (
  request: (token: string | undefined) => Promise<AxiosResponse>,
  currentToken: string | undefined,
): Promise<AxiosResponse> => {
  let response = await request(currentToken)

  if (response.status !== 401 || !currentToken) {
    return response
  }

  const refreshedToken = await refreshStoredRecorderToken()
  if (!refreshedToken) {
    return response
  }

  response = await request(refreshedToken)
  return response
}

const buildShareUrl = (
  settings: { baseUrl: string; shareUrlTemplate: string },
  video: RecorderVideo,
) => {
  if (settings.shareUrlTemplate) {
    return settings.shareUrlTemplate.replace('{{id}}', video.id)
  }
  if (video.shareUrl) return video.shareUrl
  if (settings.baseUrl) {
    return `${normalizeBaseUrl(settings.baseUrl)}/videos/${video.id}`
  }
  return ''
}

const buildJiraDescriptionLine = (issue: JiraContext) =>
  `Jira ${issue.issueKey}: ${issue.issueTitle}\n${issue.issueUrl}`

const mergeDescriptionWithJira = (
  currentDescription: string | undefined,
  issue: JiraContext,
) => {
  const jiraLine = buildJiraDescriptionLine(issue)
  const existing = (currentDescription || '').trim()

  if (!existing) {
    return jiraLine
  }

  if (existing.includes(issue.issueKey) || existing.includes(issue.issueUrl)) {
    return existing
  }

  return `${existing}\n\n${jiraLine}`
}

const mapVideo = (
  item: Record<string, unknown>,
  settings: { baseUrl: string; shareUrlTemplate: string },
): RecorderVideo => {
  const id =
    String(
      item._id ??
        item.id ??
        item.videoId ??
        item.videoUID ??
        item.uuid ??
        item.key ??
        `rec-${Math.random().toString(16).slice(2, 8)}`,
    ) || 'unknown'

  const video: RecorderVideo = {
    id,
    title: String(item.title ?? item.name ?? 'Recorder video'),
    durationSeconds: Number(item.durationSeconds ?? item.duration ?? 0) || undefined,
    createdAt: String(item.createdAt ?? item.created_at ?? item.created ?? ''),
    updatedAt: String(item.updatedAt ?? item.updated_at ?? ''),
    totalViews: toNonNegativeInteger(item.totalViews),
    totalLikes: toNonNegativeInteger(item.totalLikes),
    tags: normalizeTagValues(item.tags),
    thumbnailUrl: String(item.thumbnailUrl ?? item.s3ThumbnailUrl ?? item.thumbnail ?? ''),
    shareUrl: String(item.shareUrl ?? item.url ?? ''),
    visibility: normalizeVisibility(item.visibility),
    source: 'recorder',
  }

  return {
    ...video,
    shareUrl: buildShareUrl(settings, video),
  }
}

const fetchRecorderVideos = async (
  filters: RecorderListFilters | undefined,
): Promise<RecorderListResponse> => {
  const settings = await getSettings()
  const { baseUrl, apiToken, shareUrlTemplate } = settings.recorder
  const normalizedFilters = normalizeListFilters(filters)

  if (!baseUrl) {
    const filteredVideos = applyVideoFilters(mockVideos, normalizedFilters)
    const sortedVideos = applyVideoSorting(filteredVideos, normalizedFilters)
    const mockPagination = buildPagination({
      page: normalizedFilters.page,
      size: normalizedFilters.size,
      total: sortedVideos.length,
    })
    const start = (mockPagination.page - 1) * mockPagination.size
    const paginatedVideos = sortedVideos.slice(
      start,
      start + mockPagination.size,
    )

    return {
      ok: true,
      videos: paginatedVideos,
      pagination: mockPagination,
      warning: 'Recorder API not configured. Showing sample videos.',
    }
  }

  try {
    const response = await fetchRecorderWithRefresh(
      (token) => RecorderApi.searchVideos(baseUrl, token, {
        page: normalizedFilters.page,
        size: normalizedFilters.size,
        searchTerm: normalizedFilters.searchTerm,
        visibility: normalizedFilters.visibility,
        tags: normalizedFilters.tags,
        status: 'ready',
        sortBy: normalizedFilters.sortBy,
        sortOrder: normalizedFilters.sortOrder,
      }),
      apiToken,
    )

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        error: buildRecorderApiErrorMessage(response.status, 'list'),
      }
    }

    const payload = response.data as unknown
    const list = readListFromPayload(payload)
    const payloadPagination = readPaginationFromPayload(payload)

    const videos = list
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object',
      )
      .map((item) => mapVideo(item, { baseUrl, shareUrlTemplate }))

    const pagination = buildPagination({
      page: payloadPagination.page ?? normalizedFilters.page,
      size: payloadPagination.size ?? normalizedFilters.size,
      total: payloadPagination.total ?? videos.length,
      totalPages: payloadPagination.totalPages,
    })

    return { ok: true, videos, pagination }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to load Recorder videos.',
    }
  }
}

const postJiraComment = async (
  issue: JiraContext,
  videos: RecorderVideo[],
): Promise<{ id?: string }> => {
  const settings = await getSettings()
  const { baseUrl, email, apiToken, apiVersion } = settings.jira

  if (!baseUrl || !email || !apiToken) {
    throw new Error('Jira settings are incomplete.')
  }

  const body =
    apiVersion === '2'
      ? { body: buildPlainComment(issue, videos) }
      : { body: buildAdfComment(issue, videos) }

  const response = await JiraApi.postIssueComment({
    baseUrl,
    apiVersion,
    issueKey: issue.issueKey,
    email,
    apiToken,
    body,
  })

  if (response.status < 200 || response.status >= 300) {
    const jiraErrorMessage = parseJiraErrorMessage(response.data as unknown)
    throw new Error(
      buildJiraApiErrorMessage(
        response.status,
        jiraErrorMessage || undefined,
        'comment',
      ),
    )
  }

  const data = response.data as { id?: string }
  return { id: data.id }
}

const updateJiraDescription = async (
  issue: JiraContext,
  videos: RecorderVideo[],
) => {
  const settings = await getSettings()
  const { baseUrl, email, apiToken, apiVersion } = settings.jira

  if (!baseUrl || !email || !apiToken) {
    throw new Error('Jira settings are incomplete.')
  }

  const issueResponse = await JiraApi.getIssue({
    baseUrl,
    apiVersion,
    issueKey: issue.issueKey,
    email,
    apiToken,
  })

  if (issueResponse.status < 200 || issueResponse.status >= 300) {
    const detail = parseJiraErrorMessage(issueResponse.data as unknown)
    throw new Error(
      buildJiraApiErrorMessage(
        issueResponse.status,
        detail || undefined,
        'description',
      ),
    )
  }

  const issueData = issueResponse.data as { fields?: { description?: unknown } }
  const currentDescription = issueData.fields?.description

  const nextDescription =
    typeof currentDescription === 'string'
      ? mergePlainDescriptionWithVideos(currentDescription, issue, videos)
      : mergeAdfDescriptionWithVideos(currentDescription, issue, videos)

  const updateResponse = await JiraApi.updateIssue({
    baseUrl,
    apiVersion,
    issueKey: issue.issueKey,
    email,
    apiToken,
    fields: {
      description: nextDescription,
    },
  })

  if (updateResponse.status < 200 || updateResponse.status >= 300) {
    const detail = parseJiraErrorMessage(updateResponse.data as unknown)
    throw new Error(
      buildJiraApiErrorMessage(
        updateResponse.status,
        detail || undefined,
        'description',
      ),
    )
  }
}

const updateRecorderMetadata = async (
  issue: JiraContext,
  video: RecorderVideo,
): Promise<{ id: string; ok: boolean; error?: string }> => {
  const settings = await getSettings()
  const { baseUrl, apiToken } = settings.recorder

  if (!baseUrl) {
    return { id: video.id, ok: false, error: 'Recorder API not configured.' }
  }

  try {
    let currentDescription: string | undefined

    // Best effort: fetch current description to append Jira info without overwriting.
    const detailsResponse = await fetchRecorderWithRefresh(
      (token) => RecorderApi.getVideoById(baseUrl, token, video.id),
      apiToken,
    )

    if (detailsResponse.status >= 200 && detailsResponse.status < 300) {
      const details = detailsResponse.data as { description?: unknown }
      currentDescription =
        typeof details.description === 'string' ? details.description : undefined
    }

    const nextDescription = mergeDescriptionWithJira(currentDescription, issue)

    const body = {
      description: nextDescription,
      metadata: {
        jira: {
          key: issue.issueKey,
          url: issue.issueUrl,
          title: issue.issueTitle,
          syncedAt: new Date().toISOString(),
        },
      },
    }

    const response = await fetchRecorderWithRefresh(
      (token) => RecorderApi.updateVideo(baseUrl, token, video.id, body),
      apiToken,
    )

    if (response.status < 200 || response.status >= 300) {
      return {
        id: video.id,
        ok: false,
        error: buildRecorderApiErrorMessage(response.status, 'update'),
      }
    }

    return { id: video.id, ok: true }
  } catch (error) {
    return {
      id: video.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Recorder update failed.',
    }
  }
}

const storeJiraContext = async (message: StoreJiraContextMessage) => {
  const settings = await getSettings()
  const storage =
    globalThis.chrome?.storage?.session ?? globalThis.chrome?.storage?.local
  if (!storage) return

  await storage.set({
    [SESSION_CONTEXT_KEY]: message.payload,
    jiraContextTimestamp: Date.now(),
    jiraHost: settings.jira.baseUrl || message.payload.issueUrl,
  })
}

globalThis.chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  const handler = async (): Promise<RecorderListResponse | AttachVideosResponse | void> => {
    if (!message || typeof message !== 'object') {
      return
    }

    if (message.type === 'recorder:list') {
      const listMessage = message as RecorderListMessage
      return await fetchRecorderVideos(listMessage.payload)
    }

    if (message.type === 'attach:videos') {
      const { issue, videos, target } = message.payload as {
        issue: JiraContext
        videos: RecorderVideo[]
        target?: JiraAttachTarget
      }

      if (!issue || !issue.issueKey) {
        return { ok: false, error: 'Jira issue context not available.' }
      }

      if (!videos?.length) {
        return { ok: false, error: 'Select at least one video.' }
      }

      const attachTarget: JiraAttachTarget =
        target === 'description' || target === 'both' ? target : 'comment'
      const operationErrors: string[] = []
      let jiraCommentId: string | undefined

      if (attachTarget === 'comment' || attachTarget === 'both') {
        try {
          const jiraResult = await postJiraComment(issue, videos)
          jiraCommentId = jiraResult.id
        } catch (error) {
          operationErrors.push(
            error instanceof Error ? error.message : 'Failed to update Jira comment.',
          )
        }
      }

      if (attachTarget === 'description' || attachTarget === 'both') {
        try {
          await updateJiraDescription(issue, videos)
        } catch (error) {
          operationErrors.push(
            error instanceof Error
              ? error.message
              : 'Failed to update Jira description.',
          )
        }
      }

      const requiredOperations = attachTarget === 'both' ? 2 : 1
      if (operationErrors.length >= requiredOperations) {
        return {
          ok: false,
          error: operationErrors.join(' '),
        }
      }

      const recorderUpdates = await Promise.all(
        videos.map((video) => updateRecorderMetadata(issue, video)),
      )

      return {
        ok: true,
        jiraCommentId,
        recorderUpdates,
        warning: operationErrors.length ? operationErrors.join(' ') : undefined,
      }
    }

    if (message.type === 'jira:store-context') {
      await storeJiraContext(message as StoreJiraContextMessage)
      return
    }
  }

  handler()
    .then((response) => {
      if (response !== undefined) {
        sendResponse(response)
      } else {
        sendResponse({ ok: true })
      }
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected error.',
      })
    })

  return true
})
