import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

const api = {
  /** Start a streaming turn; resolves with the full reply text. During it, `onTurnText`
   *  and `onTurnAudio` fire with incremental text + per-sentence audio. */
  askStream: (text: string): Promise<{ text?: string; error?: string }> =>
    ipcRenderer.invoke('cva:ask-stream', text),
  /** Barge-in: stop the in-flight turn's audio/text. */
  cancel: (): Promise<void> => ipcRenderer.invoke('cva:cancel'),
  /** Clear the conversation context. */
  reset: (): Promise<void> => ipcRenderer.invoke('cva:reset'),
  /** Ask the OS for microphone access (triggers the macOS prompt). */
  requestMic: (): Promise<MicAccess> => ipcRenderer.invoke('cva:request-mic'),
  /** Warm up the TTS model. */
  ttsEnsure: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('cva:tts-ensure'),
  /** Warm up the STT model/worker. */
  sttEnsure: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('cva:stt-ensure'),
  /** Transcribe mono 16kHz Float32 audio → { text } or { error }. */
  transcribe: (samples: Float32Array): Promise<{ text?: string; error?: string }> =>
    ipcRenderer.invoke('cva:transcribe', samples),
  /** Subscribe to STT model download progress (0..100). */
  onSttProgress: (cb: (p: { progress: number }) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: { progress: number }) => cb(p)
    ipcRenderer.on('cva:stt-progress', h)
    return () => ipcRenderer.removeListener('cva:stt-progress', h)
  },

  /** Subscribe to streaming text deltas. Returns an unsubscribe fn. */
  onTurnText: (cb: (p: { delta: string }) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: { delta: string }) => cb(p)
    ipcRenderer.on('cva:turn-text', h)
    return () => ipcRenderer.removeListener('cva:turn-text', h)
  },
  /** Subscribe to per-sentence synthesized audio (Int16 PCM). Returns an unsubscribe fn. */
  onTurnAudio: (cb: (p: { seq: number; samples: Int16Array; rate: number }) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: { seq: number; samples: Int16Array; rate: number }) =>
      cb(p)
    ipcRenderer.on('cva:turn-audio', h)
    return () => ipcRenderer.removeListener('cva:turn-audio', h)
  },
  /** Subscribe to tool-use activity (for "Searching the web…" feedback). */
  onTurnTool: (cb: (p: { name: string }) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: { name: string }) => cb(p)
    ipcRenderer.on('cva:turn-tool', h)
    return () => ipcRenderer.removeListener('cva:turn-tool', h)
  },
  /** Subscribe to weather updates (from the get_weather tool). */
  onWeather: (cb: (p: Weather) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: Weather) => cb(p)
    ipcRenderer.on('cva:weather', h)
    return () => ipcRenderer.removeListener('cva:weather', h)
  },
  /** Subscribe to timer expiry (carries an optional spoken-alert audio chunk). */
  onTimerFire: (cb: (p: TimerFire) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: TimerFire) => cb(p)
    ipcRenderer.on('cva:timer-fire', h)
    return () => ipcRenderer.removeListener('cva:timer-fire', h)
  },
  /** Initial profile + memories for the HUD. */
  getProfile: (): Promise<{ profile: Profile; memories: MemoryItem[] }> =>
    ipcRenderer.invoke('cva:get-profile'),
  /** Subscribe to profile changes (name/location/units). */
  onProfile: (cb: (p: Profile) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: Profile) => cb(p)
    ipcRenderer.on('cva:profile', h)
    return () => ipcRenderer.removeListener('cva:profile', h)
  },
  /** Subscribe to memory list changes. */
  onMemory: (cb: (p: { memories: MemoryItem[] }) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: { memories: MemoryItem[] }) => cb(p)
    ipcRenderer.on('cva:memory', h)
    return () => ipcRenderer.removeListener('cva:memory', h)
  },
  /** Subscribe to per-turn token usage (for the Session widget). */
  onUsage: (cb: (p: TurnUsage) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: TurnUsage) => cb(p)
    ipcRenderer.on('cva:usage', h)
    return () => ipcRenderer.removeListener('cva:usage', h)
  },
}

export interface Profile {
  name?: string
  location?: string
  units?: 'imperial' | 'metric'
  voice?: string
}
export interface MemoryItem {
  id: string
  text: string
  createdAt: number
}

export interface Weather {
  place: string
  tempF: number
  feelsF: number
  desc: string
  humidity: number
  wind: number
}
export interface TimerFire {
  id: string
  label: string | null
  phrase: string
  samples: Int16Array | null
  rate: number | null
}
export interface TurnUsage {
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
  durationMs: number
}

contextBridge.exposeInMainWorld('cva', api)

export type CvaApi = typeof api
