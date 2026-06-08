import { contextBridge, ipcRenderer } from 'electron'

export interface CvaReply {
  text: string
  error?: string
}

export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

const api = {
  /** Send user text to Claude; resolves with the assistant's reply. */
  send: (text: string): Promise<CvaReply> => ipcRenderer.invoke('cva:send', text),
  /** Clear the conversation context. */
  reset: (): Promise<void> => ipcRenderer.invoke('cva:reset'),
  /** Ask the OS for microphone access (triggers the macOS prompt). */
  requestMic: (): Promise<MicAccess> => ipcRenderer.invoke('cva:request-mic'),
}

contextBridge.exposeInMainWorld('cva', api)

export type CvaApi = typeof api
