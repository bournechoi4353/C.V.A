import { create } from 'zustand'
import type { Weather, Profile, MemoryItem } from './global'

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
  // Tools
  toolActivity: string | null // e.g. "Searching the web…"
  weather: Weather | null
  toast: string | null
  // Memory & profile
  profile: Profile
  memories: MemoryItem[]
  setStatus: (status: Status) => void
  addMessage: (message: Message) => void
  appendMessage: (id: string, delta: string) => void
  setMessageText: (id: string, text: string) => void
  setSttReady: (ready: boolean) => void
  setSttProgress: (percent: number) => void
  setSttError: (error: string | null) => void
  setTtsReady: (ready: boolean) => void
  setTtsError: (error: string | null) => void
  setToolActivity: (activity: string | null) => void
  setWeather: (weather: Weather | null) => void
  setToast: (toast: string | null) => void
  setProfile: (profile: Profile) => void
  setMemories: (memories: MemoryItem[]) => void
}

export const useStore = create<CvaState>((set) => ({
  status: 'idle',
  messages: [],
  sttReady: false,
  sttProgress: 0,
  sttError: null,
  ttsReady: false,
  ttsError: null,
  toolActivity: null,
  weather: null,
  toast: null,
  profile: {},
  memories: [],
  setStatus: (status) => set({ status }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  appendMessage: (id, delta) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)),
    })),
  setMessageText: (id, text) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, text } : m)),
    })),
  setSttReady: (sttReady) => set({ sttReady }),
  setSttProgress: (sttProgress) => set({ sttProgress }),
  setSttError: (sttError) => set({ sttError }),
  setTtsReady: (ttsReady) => set({ ttsReady }),
  setTtsError: (ttsError) => set({ ttsError }),
  setToolActivity: (toolActivity) => set({ toolActivity }),
  setWeather: (weather) => set({ weather }),
  setToast: (toast) => set({ toast }),
  setProfile: (profile) => set({ profile }),
  setMemories: (memories) => set({ memories }),
}))
