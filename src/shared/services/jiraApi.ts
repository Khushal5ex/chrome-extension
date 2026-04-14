import axios, { type AxiosResponse } from 'axios'

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  return withProtocol.replace(/\/+$/, '')
}

type JiraCommentRequest = {
  baseUrl: string
  apiVersion: '2' | '3'
  issueKey: string
  email: string
  apiToken: string
  body: Record<string, unknown>
}

type JiraIssueRequest = {
  baseUrl: string
  apiVersion: '2' | '3'
  issueKey: string
  email: string
  apiToken: string
}

type JiraUpdateIssueRequest = JiraIssueRequest & {
  fields: Record<string, unknown>
}

const buildAuthHeader = (email: string, apiToken: string) =>
  `Basic ${btoa(`${email}:${apiToken}`)}`

const buildApiBase = (baseUrl: string, apiVersion: '2' | '3') =>
  `${normalizeBaseUrl(baseUrl)}/rest/api/${apiVersion}`

export const JiraApi = {
  postIssueComment: ({
    baseUrl,
    apiVersion,
    issueKey,
    email,
    apiToken,
    body,
  }: JiraCommentRequest): Promise<AxiosResponse<{ id?: string }>> => {
    const apiBase = buildApiBase(baseUrl, apiVersion)
    const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}/comment`

    return axios.post(url, body, {
      headers: {
        Authorization: buildAuthHeader(email, apiToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      validateStatus: () => true,
    })
  },
  getIssue: ({
    baseUrl,
    apiVersion,
    issueKey,
    email,
    apiToken,
  }: JiraIssueRequest): Promise<AxiosResponse<{ fields?: { description?: unknown } }>> => {
    const apiBase = buildApiBase(baseUrl, apiVersion)
    const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}`

    return axios.get(url, {
      params: {
        fields: 'description',
      },
      headers: {
        Authorization: buildAuthHeader(email, apiToken),
        Accept: 'application/json',
      },
      validateStatus: () => true,
    })
  },
  updateIssue: ({
    baseUrl,
    apiVersion,
    issueKey,
    email,
    apiToken,
    fields,
  }: JiraUpdateIssueRequest): Promise<AxiosResponse> => {
    const apiBase = buildApiBase(baseUrl, apiVersion)
    const url = `${apiBase}/issue/${encodeURIComponent(issueKey)}`

    return axios.put(
      url,
      { fields },
      {
        headers: {
          Authorization: buildAuthHeader(email, apiToken),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        validateStatus: () => true,
      },
    )
  },
}

export const parseJiraErrorMessage = (data: unknown): string => {
  if (typeof data === 'string') {
    return data.trim()
  }

  if (!data || typeof data !== 'object') {
    return ''
  }

  const parsed = data as {
    errorMessages?: string[]
    errors?: Record<string, string>
    message?: string
  }

  if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length) {
    return parsed.errorMessages.join(', ')
  }

  if (parsed.message) {
    return parsed.message
  }

  if (parsed.errors && Object.keys(parsed.errors).length) {
    return Object.entries(parsed.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(', ')
  }

  return ''
}
