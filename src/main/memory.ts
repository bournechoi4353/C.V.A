// Persistent long-term memory + user profile, stored as a plain JSON file in the app's
// data dir. Deliberately NOT SQLite — native modules keep crashing under Electron's ABI
// (the STT SIGTRAP), and a JSON file is plenty for a handful of facts.

import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export interface Profile {
  name?: string
  location?: string
  units?: 'imperial' | 'metric'
  voice?: string
}
export interface Memory {
  id: string
  text: string
  createdAt: number
}
interface Store {
  profile: Profile
  memories: Memory[]
}

let store: Store = { profile: {}, memories: [] }
let filePath = ''
let loaded = false
let memSeq = 0

function file(): string {
  if (!filePath) filePath = join(app.getPath('userData'), 'cva-memory.json')
  return filePath
}

export function loadMemory(): void {
  if (loaded) return
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8'))
      store = {
        profile: raw.profile ?? {},
        memories: Array.isArray(raw.memories) ? raw.memories : [],
      }
    }
  } catch (err) {
    console.error('[memory] load failed:', err)
  }
  loaded = true
}

function persist(): void {
  try {
    writeFileSync(file(), JSON.stringify(store, null, 2))
  } catch (err) {
    console.error('[memory] save failed:', err)
  }
}

export function getProfile(): Profile {
  loadMemory()
  return { ...store.profile }
}

export function setProfile(patch: Partial<Profile>): Profile {
  loadMemory()
  store.profile = { ...store.profile, ...patch }
  persist()
  return { ...store.profile }
}

export function listMemories(): Memory[] {
  loadMemory()
  return [...store.memories]
}

export function addMemory(text: string): Memory {
  loadMemory()
  const m: Memory = { id: `m${Date.now()}${memSeq++}`, text: text.trim(), createdAt: Date.now() }
  store.memories.push(m)
  persist()
  return m
}

/** Remove memories matching an id or a case-insensitive substring. Returns count removed. */
export function removeMemory(query: string): number {
  loadMemory()
  const q = query.toLowerCase()
  const before = store.memories.length
  store.memories = store.memories.filter(
    (m) => m.id !== query && !m.text.toLowerCase().includes(q),
  )
  const removed = before - store.memories.length
  if (removed > 0) persist()
  return removed
}

/** Build the dynamic memory block injected into the system prompt at session start. */
export function getMemoryContext(): string {
  loadMemory()
  const p = store.profile
  const lines: string[] = []
  const bits: string[] = []
  if (p.name) bits.push(`Their name is ${p.name} — address them by name.`)
  if (p.location)
    bits.push(`They're in ${p.location} — use this for weather/local queries when no place is given.`)
  if (p.units) bits.push(`Preferred units: ${p.units}.`)
  if (bits.length) lines.push(bits.join(' '))
  if (store.memories.length) {
    lines.push('Remembered facts:\n' + store.memories.map((m) => `- ${m.text}`).join('\n'))
  }
  if (!lines.length) return 'You have no saved memories about this user yet.'
  return `What you know about the user (from memory):\n${lines.join('\n')}`
}
