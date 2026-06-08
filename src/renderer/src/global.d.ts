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

export interface CvaApi {
  send: (text: string) => Promise<CvaReply>
  reset: () => Promise<void>
  requestMic: () => Promise<MicAccess>
  speak: (text: string) => Promise<Speech>
  ttsEnsure: () => Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    cva: CvaApi
  }
}
