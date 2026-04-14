import { useEffect, useState } from 'react'
import './App.css'
import { getSettings, updateSettings } from './shared/storage'
import { type Settings } from './shared/types'

const emptySettings: Settings = {
  jira: {
    baseUrl: '',
    email: '',
    apiToken: '',
    apiVersion: '3',
  },
  recorder: {
    baseUrl: '',
    apiToken: '',
    shareUrlTemplate: '',
  },
}

function OptionsApp() {
  const [settings, setLocalSettings] = useState<Settings>(emptySettings)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const stored = await getSettings()
      setLocalSettings(stored)
    }
    load()
  }, [])

  const update = <K extends keyof Settings>(
    section: K,
    patch: Partial<Settings[K]>,
  ) => {
    setLocalSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...patch,
      },
    }))
  }

  const save = async () => {
    await updateSettings({
      jira: settings.jira,
    })
    setStatus('Settings saved.')
    setTimeout(() => setStatus(null), 2000)
  }

  return (
    <div className="app options">
      <header className="header options-header">
        <div>
          <p className="eyebrow">TruVideo Recorder</p>
          <h1>Extension settings</h1>
          <p className="subtitle">
            Configure Jira connection for issue comments.
          </p>
        </div>
      </header>

      <section className="panel options-modal">
        <div className="panel-title">Jira connection</div>
        <label className="field">
          Jira base URL
          <input
            type="url"
            placeholder="https://your-domain.atlassian.net"
            value={settings.jira.baseUrl}
            onChange={(event) =>
              update('jira', { baseUrl: event.target.value })
            }
          />
        </label>
        <label className="field">
          Email
          <input
            type="email"
            placeholder="you@company.com"
            value={settings.jira.email}
            onChange={(event) => update('jira', { email: event.target.value })}
          />
        </label>
        <label className="field">
          API token
          <input
            type="password"
            placeholder="Jira API token"
            value={settings.jira.apiToken}
            onChange={(event) =>
              update('jira', { apiToken: event.target.value })
            }
          />
        </label>
        <label className="field">
          API version
          <select
            value={settings.jira.apiVersion}
            onChange={(event) =>
              update('jira', { apiVersion: event.target.value as '2' | '3' })
            }
          >
            <option value="3">REST v3 (ADF)</option>
            <option value="2">REST v2 (plain text)</option>
          </select>
        </label>

        <div className="options-actions">
          <button className="primary options-save" type="button" onClick={save}>
            Save settings
          </button>
        </div>

        {status && (
          <div className="status status-success options-status" role="status">
            {status}
          </div>
        )}
      </section>
    </div>
  )
}

export default OptionsApp
