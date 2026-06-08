import { contextBridge, ipcRenderer } from 'electron'

export interface CvaReply {
  text: string
  error?: string
}

export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export interface Speech {
  samples?: Float32Array
  rate?: number
  error?: string
}

const api = {
  /** Send user text to Claude; resolves with the assistant's reply. */
  send: (text: string): Promise<CvaReply> => ipcRenderer.invoke('cva:send', text),
  /** Clear the conversation context. */
  reset: (): Promise<void> => ipcRenderer.invoke('cva:reset'),
  /** Ask the OS for microphone access (triggers the macOS prompt). */
  requestMic: (): Promise<MicAccess> => ipcRenderer.invoke('cva:request-mic'),
  /** Synthesize speech for text (Kokoro, in the main process). */
  speak: (text: string): Promise<Speech> => ipcRenderer.invoke('cva:speak', text),
  /** Warm up the TTS model. */
  ttsEnsure: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('cva:tts-ensure'),
}

contextBridge.exposeInMainWorld('cva', api)

export type CvaApi = typeof api
