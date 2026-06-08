import { create } from 'zustand'

export type Status = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface CvaState {
  status: Status
  messages: Message[]
  // Speech-to-text model loading state
  sttReady: boolean
  sttProgress: number // 0..100
  sttError: string | null
  // Text-to-speech model loading state
  ttsReady: boolean
  ttsError: string | null
  setStatus: (status: Status) => void
  addMessage: (message: Message) => void
  setSttReady: (ready: boolean) => void
  setSttProgress: (percent: number) => void
  setSttError: (error: string | null) => void
  setTtsReady: (ready: boolean) => void
  setTtsError: (error: string | null) => void
}

export const useStore = create<CvaState>((set) => ({
  status: 'idle',
  messages: [],
  sttReady: false,
  sttProgress: 0,
  sttError: null,
  ttsReady: false,
  ttsError: null,
  setStatus: (status) => set({ status }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setSttReady: (sttReady) => set({ sttReady }),
  setSttProgress: (sttProgress) => set({ sttProgress }),
  setSttError: (sttError) => set({ sttError }),
  setTtsReady: (ttsReady) => set({ ttsReady }),
  setTtsError: (ttsError) => set({ ttsError }),
}))
