import { useContext } from 'react'
import { RecorderAuthContext } from './recorderAuthContext'

export const useRecorderAuth = () => {
  const context = useContext(RecorderAuthContext)
  if (!context) {
    throw new Error('useRecorderAuth must be used within RecorderAuthProvider.')
  }
  return context
}
