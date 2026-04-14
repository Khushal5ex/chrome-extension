import axios, { type AxiosResponse } from 'axios'
import {
  type RecorderVideoSortBy,
  type RecorderVideoSortOrder,
  type RecorderVideoVisibility,
} from '../types'

type RecorderHeaders = Record<string, string>

export type RecorderSearchParams = {
  page: number
  size: number
  searchTerm?: string
  visibility?: RecorderVideoVisibility
  tags?: string[]
  status?: string
  sortBy?: RecorderVideoSortBy
  sortOrder?: RecorderVideoSortOrder
}

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const buildRecorderHeaders = (token: string | undefined): RecorderHeaders => {
  const headers: RecorderHeaders = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

export const RecorderApi = {
  searchVideos: (
    baseUrl: string,
    token: string | undefined,
    params: RecorderSearchParams,
  ): Promise<AxiosResponse<unknown>> =>
    axios.get(`${normalizeBaseUrl(baseUrl)}/videos/search`, {
      headers: buildRecorderHeaders(token),
      params,
      paramsSerializer: (queryParams) => {
        const serialized = new URLSearchParams()

        Object.entries(queryParams).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            return
          }

          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item !== undefined && item !== null && item !== '') {
                serialized.append(key, String(item))
              }
            })
            return
          }

          serialized.append(key, String(value))
        })

        return serialized.toString()
      },
      validateStatus: () => true,
    }),

  getVideoById: (
    baseUrl: string,
    token: string | undefined,
    videoId: string,
  ): Promise<AxiosResponse<unknown>> =>
    axios.get(`${normalizeBaseUrl(baseUrl)}/videos/${encodeURIComponent(videoId)}`, {
      headers: buildRecorderHeaders(token),
      validateStatus: () => true,
    }),

  updateVideo: (
    baseUrl: string,
    token: string | undefined,
    videoId: string,
    payload: Record<string, unknown>,
  ): Promise<AxiosResponse<unknown>> =>
    axios.put(
      `${normalizeBaseUrl(baseUrl)}/videos/${encodeURIComponent(videoId)}`,
      payload,
      {
        headers: buildRecorderHeaders(token),
        validateStatus: () => true,
      },
    ),
}
