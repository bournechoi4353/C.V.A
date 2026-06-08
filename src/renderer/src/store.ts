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
  setStatus: (status: Status) => void
  addMessage: (message: Message) => void
}

export const useStore = create<CvaState>((set) => ({
  status: 'idle',
  messages: [],
  setStatus: (status) => set({ status }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
}))
