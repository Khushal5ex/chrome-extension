# Recorder Chrome Extension Deep Dive

This document is the current, code-accurate deep dive for `recorder-chrome-extension`.
It explains what is running today, where each responsibility lives, and how data moves end-to-end.

## 1) Product objective

The extension connects Jira issues with TruVideo Recorder videos:

1. Detect active Jira issue context (`key`, `url`, `title`).
2. Let user open an embedded extension panel directly on Jira.
3. Authenticate Recorder user via Google OAuth (`chrome.identity` flow).
4. Fetch Recorder videos.
5. Post selected video links as Jira comments.
6. Sync Jira context back to Recorder video metadata and description.

## 2) Runtime architecture

The extension is split into four runtime surfaces plus shared modules.

1. `src/content.ts`
2. `src/App.tsx` + `src/main.tsx` (popup panel app)
3. `src/background.ts` (service worker)
4. `src/OptionsApp.tsx` + `src/options.tsx` (options page)
5. `src/shared/*`, `src/contexts/*` (cross-cutting modules)

### 2.1 Content script (`src/content.ts`)

Responsibilities:

1. Detect Jira issue context from URL + DOM.
2. Inject fixed action button: `Attach Recorder Videos`.
3. Open/close embedded panel (iframe to extension `index.html`).
4. Keep panel context in sync when Jira route/title changes.
5. Send context to background using `jira:store-context`.

Implementation notes:

- Route watch: `setInterval` URL comparison every 1s.
- DOM watch: `MutationObserver` to re-read title updates.
- Issue key extraction: regex `([A-Z][A-Z0-9]+-\d+)`.

### 2.2 Popup app (`src/App.tsx`)

Responsibilities:

1. Read current issue context from URL params, with storage fallback.
2. Consume auth + settings state via `useRecorderAuth()`.
3. Load video list via runtime message `recorder:list`.
4. Submit attach request via runtime message `attach:videos`.
5. Show warnings/status for auth, settings, API failures, partial sync.

Important behavior:

- Popup does not call Jira/Recorder APIs directly.
- Popup only talks to background; background owns integration logic.
- Recorder sign in/out is delegated to auth context provider.

### 2.3 Auth context layer (`src/contexts/*`)

Files:

- `src/contexts/recorderAuthContext.ts`
- `src/contexts/recorderAuthProvider.tsx`
- `src/contexts/useRecorderAuth.ts`

Purpose:

- Centralize Recorder auth state and actions.
- Avoid auth logic duplication in `App.tsx`.
- Keep token validation and storage updates in one place.

Provider API:

- state: `settings`, `isLoading`, `authState`, `authWarning`
- derived flags: `recorderAuthReady`, `recorderConfigured`, `recorderSignedIn`
- actions: `reloadSettings()`, `signIn()`, `signOut()`

### 2.4 Background service worker (`src/background.ts`)

Background is the orchestration layer:

1. Handles runtime messages:
   - `recorder:list`
   - `attach:videos`
   - `jira:store-context`
2. Calls service clients:
   - `RecorderApi` (`src/shared/services/recorderApi.ts`)
   - `JiraApi` (`src/shared/services/jiraApi.ts`)
3. Implements token refresh-and-retry on Recorder 401.
4. Posts Jira comments.
5. Updates Recorder video description + metadata.
6. Persists Jira context to Chrome storage (`session` fallback to `local`).

### 2.5 Options page (`src/OptionsApp.tsx`)

Current options page is Jira-only by design.

Editable settings:

- Jira base URL
- Jira email
- Jira API token
- Jira API version (`2` or `3`)

Recorder token is not manually entered here; it is managed through OAuth sign-in.

## 3) Manifest, permissions, and build outputs

### 3.1 Manifest (`public/manifest.json`)

- Manifest version: 3
- Permissions: `storage`, `identity`
- Host permissions: `http://*/*`, `https://*/*`
- Background service worker: `background.js` module
- Popup: `index.html`
- Options page: `options.html`
- Content script targets Jira-like paths (`/browse/*` and Jira board route)

`identity` permission is mandatory for `chrome.identity.launchWebAuthFlow`.

### 3.2 Build outputs (Vite)

Build emits:

- `dist/background.js`
- `dist/content.js`
- popup/options bundles under `dist/assets/*`

## 4) Shared domain model and storage

### 4.1 Types (`src/shared/types.ts`)

Core types:

- `JiraContext`
- `RecorderVideo`
- `Settings` = `{ jira, recorder }`
- `RecorderSettings` includes `refreshToken` + `tokenExpiresAt`
- `SettingsPatch` for partial updates

### 4.2 Storage (`src/shared/storage.ts`)

Storage key: `truvideo_settings`

Storage strategy:

1. Primary: `chrome.storage.local`
2. Fallback: `localStorage` (for non-extension contexts)

Defaults sourced from env:

- `VITE_API_URL` -> recorder `baseUrl`
- `VITE_JIRA_BASE_URL` -> jira `baseUrl` (optional)
- `VITE_SHARE_URL_TEMPLATE` -> recorder share URL template

### 4.3 Runtime messaging

Files:

- `src/shared/messages.ts`
- `src/shared/runtime.ts`

Contracts:

- `recorder:list`
- `attach:videos`
- `jira:store-context`

`sendMessage<T>()` wraps `chrome.runtime.sendMessage` with Promise + `lastError` propagation.

## 5) Recorder authentication flow

Files:

- `src/shared/recorderAuth.ts`
- `src/contexts/recorderAuthProvider.tsx`
- `src/shared/tokenManager.ts`

### 5.1 Auth URL construction

`buildRecorderAuthUrl(redirectUri)` creates:

`{AUTH_API}/auth/google?accountUID=...&subAccountUID=...&productKey=...&redirectUrl=...`

Env keys:

- `VITE_AUTH_API_URL`
- `VITE_ACCOUNT_UID`
- `VITE_SUBACCOUNT_UID`
- `VITE_PRODUCT_KEY`

### 5.2 Sign-in sequence

1. `RecorderAuthProvider.signIn()` verifies Chrome identity API.
2. Builds redirect URI with `chrome.identity.getRedirectURL('recorder')`.
3. Opens OAuth window via `launchWebAuthFlow`.
4. Parses redirect query/hash for:
   - access token
   - refresh token
   - error fields
5. Stores tokens to settings and persists `tokenExpiresAt`.

If callback returns `code` only (no token), sign-in fails intentionally with explicit message.
Current design expects auth backend to return tokens directly for extension redirect URI.

### 5.3 Startup token sanitization

When provider loads settings:

- If access token is expired/invalid, it clears token state and sets warning.
- Validation uses JWT `exp` claim through `tokenManager`.

### 5.4 Refresh API contract

`refreshRecorderToken(refreshToken)`:

- `POST {AUTH_API}/auth/refresh`
- JSON body: `{ token: "<refreshToken>" }`
- Accepts `token` / `accessToken` / `access_token` from response

## 6) API service layer (axios)

Both integrations are abstracted into service modules and use axios.

### 6.1 Recorder API service (`src/shared/services/recorderApi.ts`)

Methods:

- `searchVideos(baseUrl, token, params)`
- `getVideoById(baseUrl, token, videoId)`
- `updateVideo(baseUrl, token, videoId, payload)`

All methods set `validateStatus: () => true`, so background handles status logic.

### 6.2 Jira API service (`src/shared/services/jiraApi.ts`)

Methods:

- `postIssueComment({ baseUrl, apiVersion, issueKey, email, apiToken, body })`

Uses Basic auth header from Jira email + API token.

Helper:

- `parseJiraErrorMessage(data)` extracts useful message from Jira error shapes.

## 7) Background integration flows

### 7.1 Recorder list flow (`recorder:list`)

1. Load settings.
2. If recorder base URL missing -> return `mockVideos` with warning.
3. Else call `RecorderApi.searchVideos(...)`.
4. On 401 with existing token, try refresh + single retry.
5. Normalize list from `videos` or `objects`.
6. Map raw items to `RecorderVideo` and resolve `shareUrl`.

Search query currently uses:

- `page=1`
- `size=50`
- `status=ready`
- `sortBy=createdAt`
- `sortOrder=desc`

### 7.2 Attach flow (`attach:videos`)

1. Validate Jira context and selected videos.
2. Post Jira comment:
   - v2 -> plain text (`buildPlainComment`)
   - v3 -> ADF (`buildAdfComment`)
3. For each selected video:
   - Fetch current video details (best effort).
   - Merge Jira info line into description (no duplicate append if already present).
   - Update video with:
     - `description`
     - `metadata.jira.key`
     - `metadata.jira.url`
     - `metadata.jira.title`
     - `metadata.jira.syncedAt`
4. Return:
   - `jiraCommentId`
   - per-video update results

### 7.3 Context persistence (`jira:store-context`)

Background stores:

- `jiraContext`
- `jiraContextTimestamp`
- `jiraHost`

Storage area used: `chrome.storage.session` if available, else `chrome.storage.local`.

## 8) Popup UI behavior and state model

`src/App.tsx` local state:

- `context`
- `videos`
- `selected`
- `loading`
- `attachState`
- `status`
- `listWarning`

From auth context:

- recorder config/auth readiness flags
- sign in/out actions
- auth warning + settings

Guard rails in UI:

- Attach button disabled when issue missing, Jira config missing, or no selection.
- Shows explicit warnings for:
  - missing Jira credentials
  - missing Recorder auth config
  - signed-out Recorder state
  - API warnings/errors

## 9) Environment variables

Defined in `.env.example`:

- `VITE_API_URL`
- `VITE_AUTH_API_URL`
- `VITE_ACCOUNT_UID`
- `VITE_SUBACCOUNT_UID`
- `VITE_PRODUCT_KEY`
- `VITE_SHARE_URL_TEMPLATE`

Optional support in storage defaults:

- `VITE_JIRA_BASE_URL`

## 10) End-to-end sequence (current)

### A) Jira page open

1. Content script extracts issue context.
2. Injects floating button + panel shell.
3. Sends `jira:store-context` to background.

### B) User signs in

1. Popup calls `signIn()` from auth context.
2. OAuth popup is launched with Recorder auth URL.
3. Redirect tokens are parsed and saved.

### C) User loads/selects videos

1. Popup sends `recorder:list`.
2. Background gets videos from Recorder API (refreshes token if needed).
3. Popup renders checkbox list.

### D) User attaches to Jira

1. Popup sends `attach:videos`.
2. Background posts Jira comment with links.
3. Background updates each Recorder video metadata/description with Jira context.
4. Popup displays success or partial-failure summary.

## 11) Known limits and assumptions

1. OAuth callback must provide access token directly for extension redirect URI.
2. Recorder refresh flow depends on valid stored refresh token.
3. Jira comment post requires valid Jira credentials and issue comment permission.
4. Host permissions are broad (`http/https *`) and can be tightened later if needed.

## 12) Current code map (quick reference)

- `src/main.tsx`: wraps app in `RecorderAuthProvider`
- `src/App.tsx`: popup UI + messaging
- `src/content.ts`: Jira DOM integration and panel injection
- `src/background.ts`: message handlers + orchestration
- `src/contexts/*`: auth context/provider/hook
- `src/shared/recorderAuth.ts`: auth URL, redirect parse, refresh call
- `src/shared/tokenManager.ts`: token expiry utilities
- `src/shared/services/recorderApi.ts`: Recorder axios client
- `src/shared/services/jiraApi.ts`: Jira axios client
- `src/shared/jira.ts`: Jira comment body builders
- `src/shared/storage.ts`: settings persistence
- `src/OptionsApp.tsx`: Jira settings form
