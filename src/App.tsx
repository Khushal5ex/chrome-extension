import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useRecorderAuth } from './contexts/useRecorderAuth'
import {
  type AttachVideosResponse,
  type JiraAttachTarget,
  type RecorderListFilters,
  type RecorderListPagination,
  type RecorderListResponse,
} from './shared/messages'
import { sendMessage } from './shared/runtime'
import {
  type JiraContext,
  type RecorderVideo,
  type RecorderVideoSortBy,
  type RecorderVideoSortOrder,
  type RecorderVideoVisibility,
} from './shared/types'

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type VisibilityFilter = 'all' | RecorderVideoVisibility
const SORT_BY_OPTIONS: { value: RecorderVideoSortBy; label: string }[] = [
  { value: 'createdAt', label: 'Created at' },
  { value: 'updatedAt', label: 'Updated at' },
  { value: 'title', label: 'Title' },
  { value: 'duration', label: 'Duration' },
  { value: 'totalViews', label: 'Views' },
  { value: 'totalLikes', label: 'Likes' },
]
const SORT_ORDER_OPTIONS: { value: RecorderVideoSortOrder; label: string }[] = [
  { value: 'desc', label: 'Descending' },
  { value: 'asc', label: 'Ascending' },
]

const parseTagInput = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )

const areArraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

const formatVisibilityLabel = (value: RecorderVideoVisibility) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const formatDuration = (durationSeconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationSeconds))

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    if (minutes === 0 && seconds === 0) {
      return `${hours}h`
    }

    if (seconds === 0) {
      return `${hours}h${minutes}m`
    }

    return `${hours}h${minutes}m${seconds}s`
  }

  if (seconds === 0) {
    return `${minutes}m`
  }

  return `${minutes}m${seconds}s`
}

const buildPaginationState = (
  page: number,
  size: number,
  total: number,
): RecorderListPagination => {
  const totalPages = Math.max(1, Math.ceil(total / size))
  const currentPage = Math.min(Math.max(page, 1), totalPages)

  return {
    page: currentPage,
    size,
    total,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  }
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.25 7.25 0 0 0-1.64-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.54-1.64.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.5a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.52.4 1.06.72 1.64.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.22 1.12-.54 1.64-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.56ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
    />
  </svg>
)

function App() {
  type StatusTone = 'error' | 'success' | 'info'
  type StatusMessage = { text: string; tone: StatusTone }

  const {
    settings,
    isLoading: authLoading,
    authState,
    recorderAuthReady,
    recorderConfigured,
    recorderSignedIn,
    authWarning,
    signIn,
    signOut,
  } = useRecorderAuth()

  const [context, setContext] = useState<JiraContext | null>(null)
  const [contextReady, setContextReady] = useState(false)
  const [videos, setVideos] = useState<RecorderVideo[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [attachState, setAttachState] = useState<'idle' | 'working' | 'done'>(
    'idle',
  )
  const [attachTarget, setAttachTarget] = useState<JiraAttachTarget>('comment')
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [listWarning, setListWarning] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState<number>(PAGE_SIZE_OPTIONS[0])
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [visibility, setVisibility] = useState<VisibilityFilter>('all')
  const [sortBy, setSortBy] = useState<RecorderVideoSortBy>('createdAt')
  const [sortOrder, setSortOrder] = useState<RecorderVideoSortOrder>('desc')
  const [hasLoadedInitialVideos, setHasLoadedInitialVideos] = useState(false)
  const [pagination, setPagination] = useState<RecorderListPagination>(
    buildPaginationState(1, PAGE_SIZE_OPTIONS[0], 0),
  )

  const jiraConfigured =
    !!settings?.jira.baseUrl && !!settings?.jira.email && !!settings?.jira.apiToken

  const setErrorStatus = (text: string) => setStatus({ text, tone: 'error' })
  const setSuccessStatus = (text: string) =>
    setStatus({ text, tone: 'success' })
  const setInfoStatus = (text: string) => setStatus({ text, tone: 'info' })

  const selectedVideos = useMemo(
    () => videos.filter((video) => selected[video.id]),
    [selected, videos],
  )

  useEffect(() => {
    const trimmedSearch = searchInput.trim()
    const parsedTags = parseTagInput(tagsInput)
    const timer = globalThis.setTimeout(() => {
      setSearchTerm((previous) =>
        previous === trimmedSearch ? previous : trimmedSearch,
      )
      setTags((previous) =>
        areArraysEqual(previous, parsedTags) ? previous : parsedTags,
      )
      setPage(1)
    }, 250)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [searchInput, tagsInput])

  const loadVideos = useCallback(async () => {
    setLoading(true)
    setListWarning(null)
    const filters: RecorderListFilters = {
      page,
      size,
      searchTerm: searchTerm || undefined,
      visibility: visibility === 'all' ? undefined : visibility,
      tags: tags.length ? tags : undefined,
      sortBy,
      sortOrder,
    }
    try {
      const response = await sendMessage<RecorderListResponse>({
        type: 'recorder:list',
        payload: filters,
      })
      if (response.ok) {
        setVideos(response.videos)
        setSelected((previous) => {
          const next: Record<string, boolean> = {}
          response.videos.forEach((video) => {
            if (previous[video.id]) {
              next[video.id] = true
            }
          })
          return next
        })
        setPagination(response.pagination)
        setListWarning(response.warning ?? null)
      } else {
        setVideos([])
        setSelected({})
        setPagination(buildPaginationState(page, size, 0))
        setErrorStatus(response.error)
      }
    } catch (error) {
      setVideos([])
      setSelected({})
      setPagination(buildPaginationState(page, size, 0))
      setErrorStatus(
        error instanceof Error ? error.message : 'Failed to load videos.',
      )
    } finally {
      setLoading(false)
    }
  }, [page, searchTerm, size, sortBy, sortOrder, tags, visibility])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const issueKey = params.get('issueKey')
    const issueUrl = params.get('issueUrl')
    const issueTitle = params.get('issueTitle')

    if (issueKey && issueUrl && issueTitle) {
      setContext({
        issueKey,
        issueUrl,
        issueTitle,
      })
      setContextReady(true)
      return
    }

    const storage =
      globalThis.chrome?.storage?.session ?? globalThis.chrome?.storage?.local
    if (!storage) {
      setContextReady(true)
      return
    }
    storage.get('jiraContext', (result) => {
      if (globalThis.chrome.runtime.lastError) {
        setContextReady(true)
        return
      }
      if (result?.jiraContext) {
        setContext(result.jiraContext as JiraContext)
      }
      setContextReady(true)
    })
  }, [])

  useEffect(() => {
    if (authLoading) {
      return
    }

    let isActive = true

    const initializeVideos = async () => {
      try {
        await loadVideos()
      } finally {
        if (isActive) {
          setHasLoadedInitialVideos(true)
        }
      }
    }

    void initializeVideos()

    return () => {
      isActive = false
    }
  }, [authLoading, loadVideos])

  const toggleSelection = (id: string) => {
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const onVisibilityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextVisibility = event.target.value as VisibilityFilter
    setVisibility(nextVisibility)
    setPage(1)
  }

  const onSortByChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSortBy(event.target.value as RecorderVideoSortBy)
    setPage(1)
  }

  const onSortOrderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(event.target.value as RecorderVideoSortOrder)
    setPage(1)
  }

  const hasActiveFilters =
    !!searchInput.trim() ||
    !!tagsInput.trim() ||
    visibility !== 'all' ||
    sortBy !== 'createdAt' ||
    sortOrder !== 'desc'

  const resetFilters = () => {
    setSearchInput('')
    setSearchTerm('')
    setTagsInput('')
    setTags([])
    setVisibility('all')
    setSortBy('createdAt')
    setSortOrder('desc')
    setPage(1)
  }

  const onSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSize = Number.parseInt(event.target.value, 10)
    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      return
    }

    setSize(nextSize)
    setPage(1)
  }

  const goToPreviousPage = () => {
    setPage((previous) => Math.max(1, previous - 1))
  }

  const goToNextPage = () => {
    setPage((previous) =>
      pagination.hasNextPage ? previous + 1 : previous,
    )
  }

  const handleSignIn = async () => {
    setStatus(null)
    try {
      const message = await signIn()
      await loadVideos()
      setSuccessStatus(message)
    } catch (error) {
      setErrorStatus(error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }

  const handleSignOut = async () => {
    setStatus(null)
    try {
      const message = await signOut()
      await loadVideos()
      setInfoStatus(message)
    } catch (error) {
      setErrorStatus(error instanceof Error ? error.message : 'Sign-out failed.')
    }
  }

  const attachVideos = async () => {
    if (!context) {
      setErrorStatus('Open a Jira issue to attach videos.')
      return
    }

    if (!selectedVideos.length) {
      setErrorStatus('Select at least one video.')
      return
    }

    setAttachState('working')
    setStatus(null)

    try {
      const response = await sendMessage<AttachVideosResponse>({
        type: 'attach:videos',
        payload: {
          issue: context,
          videos: selectedVideos,
          target: attachTarget,
        },
      })

      if (!response.ok) {
        setErrorStatus(response.error)
        setAttachState('idle')
        return
      }

      const failures = response.recorderUpdates.filter((item) => !item.ok)
      const targetLabel =
        attachTarget === 'both'
          ? 'Jira comment and description updated.'
          : attachTarget === 'description'
            ? 'Jira description updated.'
            : 'Jira comment updated.'
      const warningSuffix = response.warning ? ` ${response.warning}` : ''

      if (failures.length) {
        setInfoStatus(
          `${targetLabel} ${failures.length} video metadata update(s) failed.${warningSuffix}`,
        )
      } else if (response.warning) {
        setInfoStatus(`${targetLabel} ${response.warning}`)
      } else {
        setSuccessStatus(`${targetLabel} Video metadata synced.`)
      }
      setSelected({})
      setAttachState('idle')
    } catch (error) {
      setErrorStatus(error instanceof Error ? error.message : 'Attach failed.')
      setAttachState('idle')
    }
  }

  const openOptions = () => {
    if (globalThis.chrome?.runtime?.openOptionsPage) {
      globalThis.chrome.runtime.openOptionsPage()
    }
  }

  const isBootstrapping = authLoading || !contextReady || !hasLoadedInitialVideos

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">TruVideo Recorder</p>
          <h1>Attach videos to Jira</h1>
          <p className="subtitle">
            Select recordings from the gallery and sync Jira context back into
            metadata.
          </p>
        </div>
        <div className="header-actions">
          {recorderSignedIn ? (
            <button className="ghost" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : (
            <button
              className="google-signin"
              type="button"
              onClick={handleSignIn}
              disabled={!recorderAuthReady || authState === 'working'}
            >
              <GoogleIcon />
              <span>
                {authState === 'working' ? 'Signing in...' : 'Sign in'}
              </span>
            </button>
          )}
          <button
            className="icon-button"
            onClick={openOptions}
            type="button"
            aria-label="Open settings"
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-title">Jira issue</div>
        {!contextReady ? (
          <p className="muted">Loading Jira issue...</p>
        ) : context ? (
          <div className="jira-card">
            <div>
              <div className="jira-key">{context.issueKey}</div>
              <div className="jira-title">{context.issueTitle}</div>
            </div>
            <a
              className="jira-link"
              href={context.issueUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open issue
            </a>
          </div>
        ) : (
          <p className="muted">
            Open a Jira issue and use the injected "Attach Recorder Videos"
            button.
          </p>
        )}
        {!jiraConfigured && (
          <p className="warning">
            Jira connection missing. Add credentials in Settings.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-title">Recorder gallery</div>
        {isBootstrapping ? (
          <div className="gallery-placeholder" aria-live="polite">
            <p className="muted">Loading recorder videos...</p>
          </div>
        ) : (
          <>
            <div className="gallery-filters">
              <label className="field filter-field filter-search">
                <span>Search</span>
                <input
                  type="search"
                  placeholder="Title or description"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </label>
              <label className="field filter-field">
                <span>Visibility</span>
                <select value={visibility} onChange={onVisibilityChange}>
                  <option value="all">All</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                </select>
              </label>
              <label className="field filter-field filter-tags">
                <span>Tags</span>
                <input
                  type="text"
                  placeholder="Comma-separated (e.g. service, brake)"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                />
              </label>
              <label className="field filter-field">
                <span>Sort by</span>
                <select value={sortBy} onChange={onSortByChange}>
                  {SORT_BY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field filter-field">
                <span>Order</span>
                <select value={sortOrder} onChange={onSortOrderChange}>
                  {SORT_ORDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="filter-actions">
                <button
                  className="ghost filter-reset"
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                >
                  Reset filters
                </button>
              </div>
            </div>
            {!recorderAuthReady && (
              <p className="warning">
                Recorder auth URL not configured. Set VITE_AUTH_API_URL in .env.
              </p>
            )}
            {recorderConfigured && !recorderSignedIn && (
              <p className="warning">
                Recorder sign-in required. Use "Sign in with Google" above.
              </p>
            )}
            {!recorderConfigured && !listWarning && !authWarning && (
              <p className="warning">
                Recorder API not configured. Showing sample videos.
              </p>
            )}
            {authWarning && <p className="warning">{authWarning}</p>}
            {listWarning && <p className="warning">{listWarning}</p>}
            {loading && (
              <div className="gallery-inline-loader" aria-live="polite">
                <p className="muted">Refreshing videos...</p>
              </div>
            )}
            {videos.length ? (
              <div className="video-grid">
                {videos.map((video) => (
                  <label className="video-card" key={video.id}>
                    <input
                      type="checkbox"
                      checked={!!selected[video.id]}
                      onChange={() => toggleSelection(video.id)}
                    />
                    <div className="video-body">
                      <div className="video-title">{video.title}</div>
                      <div className="video-meta">
                        {video.visibility ? (
                          <span className="video-meta-chip">
                            {formatVisibilityLabel(video.visibility)}
                          </span>
                        ) : null}
                        {video.durationSeconds !== undefined ? (
                          <span className="video-meta-chip">
                            {formatDuration(video.durationSeconds)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="gallery-placeholder">
                <p className="muted">No videos available.</p>
              </div>
            )}
            <div className="gallery-footer">
              <div className="list-controls">
                <label className="page-size-control">
                  <span>Page size</span>
                  <select value={size} onChange={onSizeChange} disabled={loading}>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="muted pagination-summary">
                  Page {pagination.page} of {pagination.totalPages} |{' '}
                  {pagination.total} video{pagination.total === 1 ? '' : 's'}
                </div>
              </div>
              <div className="pagination-actions">
                <button
                  className="ghost pagination-button"
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={loading || !pagination.hasPreviousPage}
                >
                  Previous
                </button>
                <button
                  className="ghost pagination-button"
                  type="button"
                  onClick={goToNextPage}
                  disabled={loading || !pagination.hasNextPage}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="panel actions">
        <div>
          <div className="selection">
            {selectedVideos.length} selected
          </div>
          <div className="muted">
            Choose where to attach video links in Jira, then sync metadata to
            each video.
          </div>
          <fieldset className="attach-targets">
            <legend>Attach links to</legend>
            <label className="attach-target-option">
              <input
                type="radio"
                name="attach-target"
                value="comment"
                checked={attachTarget === 'comment'}
                onChange={() => setAttachTarget('comment')}
              />
              Comment
            </label>
            <label className="attach-target-option">
              <input
                type="radio"
                name="attach-target"
                value="description"
                checked={attachTarget === 'description'}
                onChange={() => setAttachTarget('description')}
              />
              Description
            </label>
            <label className="attach-target-option">
              <input
                type="radio"
                name="attach-target"
                value="both"
                checked={attachTarget === 'both'}
                onChange={() => setAttachTarget('both')}
              />
              Both
            </label>
          </fieldset>
          <div className="muted">
            {attachTarget === 'both'
              ? 'This will update Jira comment and description.'
              : attachTarget === 'description'
                ? 'This will update Jira description only.'
                : 'This will update Jira comment only.'}
          </div>
        </div>
        <button
          className="primary"
          type="button"
          onClick={attachVideos}
          disabled={
            attachState === 'working' ||
            !context ||
            !jiraConfigured ||
            selectedVideos.length === 0
          }
        >
          {attachState === 'working' ? 'Attaching...' : 'Attach to Jira'}
        </button>
      </section>

      {status && (
        <div
          className={`status status-${status.tone}`}
          role={status.tone === 'error' ? 'alert' : 'status'}
          aria-live={status.tone === 'error' ? 'assertive' : 'polite'}
        >
          {status.text}
        </div>
      )}
    </div>
  )
}

export default App
