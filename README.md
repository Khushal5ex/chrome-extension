# TruVideo Recorder Chrome Extension

Chrome extension that lets users attach TruVideo Recorder videos to Jira issues and sync Jira context back to Recorder metadata.

## Tech Stack

- React + TypeScript + Vite
- Chrome Extension Manifest V3
- Axios for API calls

## Features

- Jira issue context capture from Jira pages (content script)
- Recorder Google sign-in via `chrome.identity`
- Recorder video list with token refresh handling
- Attach selected videos to Jira comments
- Sync Jira metadata + description into Recorder video
- Jira-only settings UI for credentials

## Environment

Copy `.env.example` to `.env` and fill values:

- `VITE_API_URL`
- `VITE_AUTH_API_URL`
- `VITE_ACCOUNT_UID`
- `VITE_SUBACCOUNT_UID`
- `VITE_PRODUCT_KEY`
- `VITE_SHARE_URL_TEMPLATE`

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run build`

## Build and Load in Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click **Load unpacked**
5. Select `recorder-chrome-extension/dist`

## Architecture

- `src/content.ts`: Jira page button + panel injection + issue context capture
- `src/background.ts`: orchestration for Recorder/Jira workflows
- `src/shared/services/recorderApi.ts`: Recorder API client
- `src/shared/services/jiraApi.ts`: Jira API client
- `src/contexts/*`: auth context/provider/hook for popup auth state
- `src/OptionsApp.tsx`: Jira settings

For detailed flow, see:

- `docs/RECORDER_CHROME_EXTENSION_DEEP_DIVE.md`
- `docs/QA_TEST_PLAN.md`
