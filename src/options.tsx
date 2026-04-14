import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import OptionsApp from './OptionsApp'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
)
