import { contextBridge, ipcRenderer } from 'electron'

export interface CvaReply {
  text: string
  error?: string
}

const api = {
  /** Send user text to Claude; resolves with the assistant's reply. */
  send: (text: string): Promise<CvaReply> => ipcRenderer.invoke('cva:send', text),
  /** Clear the conversation context. */
  reset: (): Promise<void> => ipcRenderer.invoke('cva:reset'),
}

contextBridge.exposeInMainWorld('cva', api)

export type CvaApi = typeof api
