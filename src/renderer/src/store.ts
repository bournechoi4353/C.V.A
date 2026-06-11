import { create } from 'zustand'
import type { Weather, Profile, MemoryItem, TurnUsage } from './global'

export interface SessionUsage {
  turns: number
  inTokens: number // input incl. cache reads/writes
  outTokens: number
  costUsd: number
}

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
  // Wake word ("Claude") hands-free mode
  wakeMode: boolean
  wakeHeard: string | null // last thing the wake listener transcribed (for feedback)
  usage: SessionUsage // cumulative Claude usage this session
  addUsage: (u: TurnUsage) => void
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
  setWakeMode: (on: boolean) => void
  setWakeHeard: (text: string | null) => void
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
  wakeMode: false,
  wakeHeard: null,
  usage: { turns: 0, inTokens: 0, outTokens: 0, costUsd: 0 },
  addUsage: (u) =>
    set((s) => ({
      usage: {
        turns: s.usage.turns + 1,
        inTokens: s.usage.inTokens + u.inputTokens + u.cacheRead + u.cacheWrite,
        outTokens: s.usage.outTokens + u.outputTokens,
        costUsd: s.usage.costUsd + u.costUsd,
      },
    })),
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
  setWakeMode: (wakeMode) => set({ wakeMode }),
  setWakeHeard: (wakeHeard) => set({ wakeHeard }),
}))
