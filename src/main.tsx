import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RecorderAuthProvider } from './contexts/recorderAuthProvider'

const params = new URLSearchParams(window.location.search)
if (params.get('embedded') === '1') {
  document.body.dataset.embedded = '1'
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <RecorderAuthProvider>
      <App />
    </RecorderAuthProvider>
  </StrictMode>,
)
