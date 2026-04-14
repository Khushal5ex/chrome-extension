import { type AppMessage } from './messages'

export function sendMessage<TResponse>(message: AppMessage): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      reject(new Error('Chrome runtime messaging is not available.'))
      return
    }

    globalThis.chrome.runtime.sendMessage(message, (response: TResponse) => {
      const error = globalThis.chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      resolve(response)
    })
  })
}
