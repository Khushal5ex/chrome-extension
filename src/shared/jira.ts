import { type JiraContext, type RecorderVideo } from './types'

const buildPlainVideoLinksBlock = (
  issue: JiraContext,
  videos: RecorderVideo[],
) => {
  const lines = [
    `Recorder videos linked to ${issue.issueKey}:`,
    ...videos.map((video) => {
      const title = video.title || 'Recorder video'
      return video.shareUrl ? `- ${title}: ${video.shareUrl}` : `- ${title}`
    }),
  ]

  return lines.join('\n')
}

const buildAdfVideoLinksBlock = (issue: JiraContext, videos: RecorderVideo[]) => [
  {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: `Recorder videos linked to ${issue.issueKey}:`,
      },
    ],
  },
  ...videos.map((video) => {
    const title = video.title || 'Recorder video'
    if (!video.shareUrl) {
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: title }],
      }
    }

    return {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: title,
          marks: [
            {
              type: 'link',
              attrs: {
                href: video.shareUrl,
              },
            },
          ],
        },
      ],
    }
  }),
]

const isAdfDoc = (value: unknown): value is { type: 'doc'; version: 1; content: unknown[] } => {
  if (!value || typeof value !== 'object') return false
  const parsed = value as { type?: unknown; version?: unknown; content?: unknown }
  return (
    parsed.type === 'doc' &&
    parsed.version === 1 &&
    Array.isArray(parsed.content)
  )
}

const getShareUrls = (videos: RecorderVideo[]) =>
  videos
    .map((video) => video.shareUrl)
    .filter((url): url is string => !!url)

export function buildPlainComment(
  issue: JiraContext,
  videos: RecorderVideo[],
): string {
  return buildPlainVideoLinksBlock(issue, videos)
}

export function buildAdfComment(
  issue: JiraContext,
  videos: RecorderVideo[],
): Record<string, unknown> {
  return {
    type: 'doc',
    version: 1,
    content: buildAdfVideoLinksBlock(issue, videos),
  }
}

export function mergePlainDescriptionWithVideos(
  currentDescription: string | undefined,
  issue: JiraContext,
  videos: RecorderVideo[],
): string {
  const nextBlock = buildPlainVideoLinksBlock(issue, videos)
  const existing = (currentDescription || '').trim()
  if (!existing) {
    return nextBlock
  }

  const shareUrls = getShareUrls(videos)
  const hasHeader = existing.includes(`Recorder videos linked to ${issue.issueKey}:`)
  const hasAllUrls = shareUrls.length > 0 && shareUrls.every((url) => existing.includes(url))
  if (hasHeader && (shareUrls.length === 0 || hasAllUrls)) {
    return existing
  }

  return `${existing}\n\n${nextBlock}`
}

export function mergeAdfDescriptionWithVideos(
  currentDescription: unknown,
  issue: JiraContext,
  videos: RecorderVideo[],
): Record<string, unknown> {
  const existingDoc = isAdfDoc(currentDescription)
    ? currentDescription
    : { type: 'doc' as const, version: 1 as const, content: [] as unknown[] }

  const serialized = JSON.stringify(existingDoc)
  const shareUrls = getShareUrls(videos)
  const hasHeader = serialized.includes(`Recorder videos linked to ${issue.issueKey}:`)
  const hasAllUrls = shareUrls.length > 0 && shareUrls.every((url) => serialized.includes(url))
  if (hasHeader && (shareUrls.length === 0 || hasAllUrls)) {
    return existingDoc
  }

  return {
    ...existingDoc,
    content: [...existingDoc.content, ...buildAdfVideoLinksBlock(issue, videos)],
  }
}
