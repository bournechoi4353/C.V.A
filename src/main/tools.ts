// Custom in-process tools Claude can call (via the Agent SDK's in-process MCP server),
// plus the allow-list (our tools + the built-in WebSearch). All free, no API key:
// get_time and set_timer are local; get_weather uses Open-Meteo (free, keyless); WebSearch
// runs on the Claude subscription.

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { synthesize } from './tts'
import { addMemory, removeMemory, setProfile, getProfile, listMemories } from './memory'

// Emitter to push side-channel UI updates (weather card, timer alerts) to the renderer.
type Emit = (channel: string, payload: unknown) => void
let emit: Emit = () => {}
export function setToolEmitter(fn: Emit): void {
  emit = fn
}

const WEATHER_CODES: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'freezing drizzle', 61: 'light rain', 63: 'rain',
  65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow',
  73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'rain showers', 81: 'rain showers',
  82: 'violent rain showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm',
  96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
}

async function fetchWeather(location: string) {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
  )
  const geo = (await geoRes.json()) as {
    results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>
  }
  const place = geo.results?.[0]
  if (!place) throw new Error(`Couldn't find a place called "${location}".`)

  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph`,
  )
  const wj = (await wRes.json()) as {
    current: {
      temperature_2m: number
      apparent_temperature: number
      weather_code: number
      wind_speed_10m: number
      relative_humidity_2m: number
    }
  }
  const c = wj.current
  return {
    place: place.admin1 ? `${place.name}, ${place.admin1}` : place.name,
    tempF: Math.round(c.temperature_2m),
    feelsF: Math.round(c.apparent_temperature),
    desc: WEATHER_CODES[c.weather_code] ?? 'unknown conditions',
    humidity: c.relative_humidity_2m,
    wind: Math.round(c.wind_speed_10m),
  }
}

const getTime = tool(
  'get_time',
  'Get the current local date and time. Use when the user asks the time or date.',
  {},
  async () => {
    const text = new Date().toLocaleString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    return { content: [{ type: 'text', text }] }
  },
)

const getWeather = tool(
  'get_weather',
  'Get the current weather for a city. Use when the user asks about weather or temperature.',
  { location: z.string().describe('City name, e.g. "San Francisco" or "Paris"') },
  async ({ location }) => {
    try {
      const w = await fetchWeather(location)
      emit('cva:weather', w) // populate the HUD weather widget
      return {
        content: [
          {
            type: 'text' as const,
            text: `${w.place}: ${w.tempF}°F (feels like ${w.feelsF}°F), ${w.desc}, humidity ${w.humidity}%, wind ${w.wind} mph.`,
          },
        ],
      }
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      }
    }
  },
)

let timerSeq = 0
const setTimer = tool(
  'set_timer',
  'Set a countdown timer. Use when the user asks to set a timer or be reminded in N seconds/minutes.',
  {
    seconds: z.number().describe('Duration in seconds'),
    label: z.string().optional().describe('Optional short label, e.g. "pasta"'),
  },
  async ({ seconds, label }) => {
    const id = `t${timerSeq++}`
    const secs = Math.max(1, Math.round(seconds))
    setTimeout(async () => {
      const phrase = label ? `Your ${label} timer is done.` : 'Your timer is done.'
      try {
        const { samples, rate } = await synthesize(phrase)
        emit('cva:timer-fire', { id, label: label ?? null, phrase, samples, rate })
      } catch {
        emit('cva:timer-fire', { id, label: label ?? null, phrase, samples: null, rate: null })
      }
    }, secs * 1000)
    const pretty = secs >= 60 ? `${Math.round(secs / 60)} minute(s)` : `${secs} seconds`
    return {
      content: [{ type: 'text' as const, text: `Timer set for ${pretty}${label ? ` (${label})` : ''}.` }],
    }
  },
)

const remember = tool(
  'remember',
  'Save a durable fact or preference about the user so you recall it in future sessions. ' +
    'Use it when the user shares something worth remembering long-term (a preference, a ' +
    'recurring detail, an important name). Do not use it for one-off requests.',
  { text: z.string().describe('The fact to remember, phrased concisely in the third person') },
  async ({ text }) => {
    addMemory(text)
    emit('cva:memory', { memories: listMemories() })
    return { content: [{ type: 'text' as const, text: 'Noted — I will remember that.' }] }
  },
)

const forget = tool(
  'forget',
  'Remove a remembered fact. Provide a word or phrase that matches the fact to forget.',
  { query: z.string().describe('A word/phrase matching the memory to remove') },
  async ({ query }) => {
    const n = removeMemory(query)
    emit('cva:memory', { memories: listMemories() })
    return {
      content: [
        { type: 'text' as const, text: n > 0 ? `Forgotten.` : `I had nothing matching "${query}".` },
      ],
    }
  },
)

const setProfileTool = tool(
  'set_profile',
  "Set the user's profile. Use when they tell you their name, where they are, or their " +
    'preferred units. This persists across sessions.',
  {
    name: z.string().optional().describe('What to call the user'),
    location: z.string().optional().describe('Their city, e.g. "Seattle"'),
    units: z.enum(['imperial', 'metric']).optional().describe('Preferred units'),
  },
  async (args) => {
    const profile = setProfile(args)
    emit('cva:profile', profile)
    return { content: [{ type: 'text' as const, text: 'Got it.' }] }
  },
)

export function createToolServer() {
  return createSdkMcpServer({
    name: 'cva',
    version: '1.0.0',
    tools: [getTime, getWeather, setTimer, remember, forget, setProfileTool],
  })
}

// Re-export for the initial renderer fetch.
export { getProfile, listMemories }

// Allow-list: our tools + the built-in web search. permissionMode 'dontAsk' denies the rest.
export const ALLOWED_TOOLS = [
  'mcp__cva__get_time',
  'mcp__cva__get_weather',
  'mcp__cva__set_timer',
  'mcp__cva__remember',
  'mcp__cva__forget',
  'mcp__cva__set_profile',
  'WebSearch',
]
