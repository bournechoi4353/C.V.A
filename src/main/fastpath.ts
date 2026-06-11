// Alexa-style local fast path: clear-cut commands (time, timer, weather) are answered
// directly in the main process — template reply + Kokoro — skipping the Claude round
// trip entirely. A "what time is it" goes from ~3s to well under 1s. Anything the
// parser doesn't confidently match falls through to Claude (which has conversation
// context, memory, and tools), so this can only make things faster, never dumber.
//
// Trade-off (deliberate): fast-path turns don't enter Claude's conversation context.
// For glanceable facts like the time or the temperature that's how Alexa behaves too.

import { parseIntent } from '../shared/intents.mjs'
import { fetchWeather, startTimer, emitUi } from './tools'
import { getProfile } from './memory'
import { synthesize, floatToInt16 } from './tts'
import { log } from './logger'

function timeReply(): string {
  const now = new Date().toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `It's ${now}.`
}

async function weatherReply(location: string): Promise<string | null> {
  const place = location || getProfile().location
  if (!place) return null // no location to use — let Claude ask the follow-up
  const w = await fetchWeather(place)
  emitUi('cva:weather', w) // keep the HUD widget in sync, same as the tool
  const city = w.place.split(',')[0]
  const metric = getProfile().units === 'metric'
  const temp = metric ? Math.round(((w.tempF - 32) * 5) / 9) : w.tempF
  return `It's ${temp} degrees and ${w.desc} in ${city} right now.`
}

/**
 * Try to answer a command locally. On a hit: emits the reply over the same channels as
 * a streamed turn (cva:turn-text + cva:turn-audio) and resolves with the reply text.
 * Resolves null when the command needs Claude.
 */
export async function tryFastPath(
  text: string,
  send: (channel: string, payload: unknown) => void,
  shouldCancel: () => boolean,
): Promise<string | null> {
  const intent = parseIntent(text)
  if (!intent) return null

  const t0 = Date.now()
  let reply: string | null = null
  try {
    if (intent.type === 'time') reply = timeReply()
    else if (intent.type === 'timer') reply = startTimer(intent.seconds, intent.label)
    else if (intent.type === 'weather') reply = await weatherReply(intent.location)
  } catch (err) {
    // e.g. geocode/network failure — fall through to Claude rather than erroring a turn
    log('error', `fastpath failed, falling through to Claude: ${err instanceof Error ? err.message : err}`)
    return null
  }
  if (reply === null || shouldCancel()) return reply === null ? null : ''

  send('cva:turn-text', { delta: reply })
  const { samples, rate } = await synthesize(reply)
  if (!shouldCancel()) {
    send('cva:turn-audio', { seq: 0, samples: floatToInt16(samples), rate })
  }
  log('timing', `fastpath '${intent.type}': total ${((Date.now() - t0) / 1000).toFixed(2)}s`)
  return reply
}
