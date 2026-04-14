import { type JiraContext } from './shared/types'

const BUTTON_ID = 'truvideo-jira-action'
const PANEL_ID = 'truvideo-jira-panel'
const PANEL_BACKDROP_ID = 'truvideo-jira-backdrop'
const STYLE_ID = 'truvideo-jira-style'
const BUTTON_OPEN_LABEL = 'Attach Recorder Videos'
const BUTTON_CLOSE_LABEL = 'Close Recorder'

const ISSUE_KEY_REGEX = /([A-Z][A-Z0-9]+-\d+)/i

const buildContextSignature = (context: JiraContext) =>
  `${context.issueKey}|${context.issueUrl}|${context.issueTitle}`

const getIssueKeyFromUrl = () => {
  const match = window.location.href.match(ISSUE_KEY_REGEX)
  return match ? match[1].toUpperCase() : ''
}

const getIssueTitle = () => {
  const selectors = [
    '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
    '[data-test-id="issue.views.issue-base.foundation.summary.heading"]',
    '[data-testid="issue.views.issue-base.foundation.summary.heading-container"] h1',
    'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]',
  ]

  for (const selector of selectors) {
    const node = document.querySelector(selector)
    if (node?.textContent) {
      return node.textContent.trim()
    }
  }

  const title = document.title.replace(' - Jira', '').trim()
  return title || 'Jira issue'
}

const buildContext = (): JiraContext | null => {
  const issueKey = getIssueKeyFromUrl()
  if (!issueKey) return null

  return {
    issueKey,
    issueUrl: window.location.href,
    issueTitle: getIssueTitle(),
  }
}

const storeContext = async (context: JiraContext) => {
  if (!globalThis.chrome?.runtime?.sendMessage) return
  try {
    await globalThis.chrome.runtime.sendMessage({
      type: 'jira:store-context',
      payload: context,
    })
  } catch {
    // no-op
  }
}

const extensionIndexUrl = (() => {
  try {
    return globalThis.chrome?.runtime?.getURL('index.html') ?? null
  } catch {
    return null
  }
})()

const buildPanelUrl = (context: JiraContext) => {
  if (!extensionIndexUrl) return null
  const url = new URL(extensionIndexUrl)
  url.searchParams.set('embedded', '1')
  url.searchParams.set('issueKey', context.issueKey)
  url.searchParams.set('issueUrl', context.issueUrl)
  url.searchParams.set('issueTitle', context.issueTitle)
  return url.toString()
}

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${BUTTON_ID} {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      background: linear-gradient(135deg, #0f1b2d, #1f3a5f);
      color: #f8f9ff;
      font-family: "Segoe UI Variable", "SF Pro Text", "Segoe UI", sans-serif;
      font-size: 13px;
      letter-spacing: 0.02em;
      box-shadow: 0 16px 28px rgba(15, 27, 45, 0.35);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #${BUTTON_ID}:hover {
      transform: translateY(-1px);
    }
    #${PANEL_BACKDROP_ID} {
      position: fixed;
      inset: 0;
      background: rgba(10, 18, 32, 0.35);
      z-index: 2147483646;
    }
    #${PANEL_ID} {
      position: fixed;
      right: 20px;
      bottom: 80px;
      width: min(460px, calc(100vw - 24px));
      height: min(760px, calc(100vh - 96px));
      background: #f8f9ff;
      border-radius: 18px;
      box-shadow: 0 28px 60px rgba(10, 18, 32, 0.35);
      overflow: hidden;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
    }
    #${PANEL_ID} .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: #0f1b2d;
      color: #f8f9ff;
      font-family: "Segoe UI Variable", "SF Pro Text", "Segoe UI", sans-serif;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    #${PANEL_ID} .panel-close {
      border: none;
      background: rgba(248, 249, 255, 0.15);
      color: #f8f9ff;
      border-radius: 999px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 11px;
    }
    #${PANEL_ID} iframe {
      border: 0;
      width: 100%;
      height: 100%;
      background: transparent;
    }
  `
  document.head.appendChild(style)
}

const closePanel = () => {
  document.getElementById(PANEL_ID)?.remove()
  document.getElementById(PANEL_BACKDROP_ID)?.remove()
  const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null
  if (button) {
    button.textContent = BUTTON_OPEN_LABEL
    button.setAttribute('aria-expanded', 'false')
  }
}

const openPanel = (context: JiraContext) => {
  ensureStyle()

  const panelUrl = buildPanelUrl(context)
  const existing = document.getElementById(PANEL_ID)
  if (existing) {
    const iframe = existing.querySelector('iframe')
    if (iframe && panelUrl) {
      iframe.setAttribute('src', panelUrl)
    }
    const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null
    if (button) {
      button.textContent = BUTTON_CLOSE_LABEL
      button.setAttribute('aria-expanded', 'true')
    }
    return
  }

  const backdrop = document.createElement('div')
  backdrop.id = PANEL_BACKDROP_ID
  backdrop.addEventListener('click', closePanel)

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.innerHTML = `
    <div class="panel-header">
      TruVideo Recorder
      <button class="panel-close" type="button">Close</button>
    </div>
    ${
      panelUrl
        ? `<iframe src="${panelUrl}" title="TruVideo Recorder"></iframe>`
        : `<div style="padding:16px;font-family:'Segoe UI',sans-serif;font-size:13px;color:#0f1b2d;">
            Extension context not available. Reload this Jira tab after reloading the extension.
          </div>`
    }
  `

  const closeButton = panel.querySelector('.panel-close')
  closeButton?.addEventListener('click', closePanel)

  document.body.appendChild(backdrop)
  document.body.appendChild(panel)
  const button = document.getElementById(BUTTON_ID) as HTMLButtonElement | null
  if (button) {
    button.textContent = BUTTON_CLOSE_LABEL
    button.setAttribute('aria-expanded', 'true')
  }
}

const syncPanelContext = (context: JiraContext) => {
  const existing = document.getElementById(PANEL_ID)
  if (!existing) return
  const iframe = existing.querySelector('iframe')
  if (!iframe) return
  const panelUrl = buildPanelUrl(context)
  if (!panelUrl) return
  if (iframe.getAttribute('src') === panelUrl) {
    return
  }
  iframe.setAttribute('src', panelUrl)
}

const ensureButton = (context: JiraContext) => {
  ensureStyle()
  const existing = document.getElementById(BUTTON_ID) as HTMLButtonElement | null
  const button = existing ?? document.createElement('button')
  if (!existing) {
    button.id = BUTTON_ID
    button.type = 'button'
    button.textContent = BUTTON_OPEN_LABEL
    button.setAttribute('aria-expanded', 'false')
    document.body.appendChild(button)
  }

  button.dataset.issueKey = context.issueKey
  button.dataset.issueUrl = context.issueUrl
  button.dataset.issueTitle = context.issueTitle
  button.onclick = () => {
    if (document.getElementById(PANEL_ID)) {
      closePanel()
      return
    }
    const nextContext: JiraContext = {
      issueKey: button.dataset.issueKey ?? context.issueKey,
      issueUrl: button.dataset.issueUrl ?? context.issueUrl,
      issueTitle: button.dataset.issueTitle ?? context.issueTitle,
    }
    openPanel(nextContext)
  }
}

const removeButton = () => {
  document.getElementById(BUTTON_ID)?.remove()
  closePanel()
}

let lastStoredContextSignature: string | null = null

const refresh = async () => {
  const context = buildContext()
  if (!context) {
    lastStoredContextSignature = null
    removeButton()
    return
  }

  ensureButton(context)
  syncPanelContext(context)
  const nextSignature = buildContextSignature(context)
  if (nextSignature === lastStoredContextSignature) {
    return
  }

  lastStoredContextSignature = nextSignature
  await storeContext(context)
}

const start = () => {
  let refreshTimer: number | null = null
  const scheduleRefresh = () => {
    if (refreshTimer !== null) {
      return
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      void refresh()
    }, 150)
  }

  void refresh()
  let lastUrl = window.location.href
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      scheduleRefresh()
    }
  }, 1000)

  const observer = new MutationObserver(() => {
    scheduleRefresh()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

start()
