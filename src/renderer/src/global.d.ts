export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

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
  samples: Float32Array | null
  rate: number | null
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

export interface CvaApi {
  askStream: (text: string) => Promise<{ text?: string; error?: string }>
  cancel: () => Promise<void>
  reset: () => Promise<void>
  requestMic: () => Promise<MicAccess>
  ttsEnsure: () => Promise<{ ok: boolean; error?: string }>
  sttEnsure: () => Promise<{ ok: boolean; error?: string }>
  transcribe: (samples: Float32Array) => Promise<{ text?: string; error?: string }>
  onSttProgress: (cb: (p: { progress: number }) => void) => () => void
  onTurnText: (cb: (p: { delta: string }) => void) => () => void
  onTurnAudio: (cb: (p: { seq: number; samples: Float32Array; rate: number }) => void) => () => void
  onTurnTool: (cb: (p: { name: string }) => void) => () => void
  onWeather: (cb: (p: Weather) => void) => () => void
  onTimerFire: (cb: (p: TimerFire) => void) => () => void
  getProfile: () => Promise<{ profile: Profile; memories: MemoryItem[] }>
  onProfile: (cb: (p: Profile) => void) => () => void
  onMemory: (cb: (p: { memories: MemoryItem[] }) => void) => () => void
}

declare global {
  interface Window {
    cva: CvaApi
  }
}
