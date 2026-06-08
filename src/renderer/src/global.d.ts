export interface CvaReply {
  text: string
  error?: string
}

export interface CvaApi {
  send: (text: string) => Promise<CvaReply>
  reset: () => Promise<void>
}

declare global {
  interface Window {
    cva: CvaApi
  }
}
