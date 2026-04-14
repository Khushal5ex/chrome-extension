import {
  type JiraContext,
  type RecorderVideoSortBy,
  type RecorderVideoSortOrder,
  type RecorderVideo,
  type RecorderVideoVisibility,
} from './types'

export type RecorderListFilters = {
  page?: number
  size?: number
  searchTerm?: string
  visibility?: RecorderVideoVisibility
  tags?: string[]
  sortBy?: RecorderVideoSortBy
  sortOrder?: RecorderVideoSortOrder
}

export type RecorderListPagination = {
  page: number
  size: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export type RecorderListMessage = {
  type: 'recorder:list'
  payload?: RecorderListFilters
}

export type JiraAttachTarget = 'comment' | 'description' | 'both'

export type AttachVideosMessage = {
  type: 'attach:videos'
  payload: {
    issue: JiraContext
    videos: RecorderVideo[]
    target: JiraAttachTarget
  }
}

export type StoreJiraContextMessage = {
  type: 'jira:store-context'
  payload: JiraContext
}

export type AppMessage =
  | RecorderListMessage
  | AttachVideosMessage
  | StoreJiraContextMessage

export type RecorderListResponse =
  | {
      ok: true
      videos: RecorderVideo[]
      pagination: RecorderListPagination
      warning?: string
    }
  | {
      ok: false
      error: string
    }

export type AttachVideosResponse =
  | {
      ok: true
      jiraCommentId?: string
      recorderUpdates: { id: string; ok: boolean; error?: string }[]
      warning?: string
    }
  | {
      ok: false
      error: string
    }
