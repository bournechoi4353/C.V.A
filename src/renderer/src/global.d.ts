export interface CvaReply {
  text: string
  error?: string
}

export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export interface CvaApi {
  send: (text: string) => Promise<CvaReply>
  reset: () => Promise<void>
  requestMic: () => Promise<MicAccess>
}

declare global {
  interface Window {
    cva: CvaApi
  }
}
