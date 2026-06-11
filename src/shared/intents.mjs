// Local intent parsing for the Alexa-style fast path: clear-cut commands (time, timer,
// weather) are answered locally in well under a second instead of taking a 2–4s round
// trip through Claude. Parsing is deliberately conservative — anything ambiguous
// returns null and goes to Claude, which has conversation context and tools.
//
// Plain JS (not TS) so the Electron main process and the Node test harness
// (scripts/test-intents.mjs) share the exact same logic.

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
}

const UNIT_SECONDS = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600 }

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'.]/g, ' ')
    .replace(/\.(?!\d)/g, ' ') // keep decimal points ("1.5 hours"), drop sentence periods
    .replace(/\s+/g, ' ')
    .trim()
}

/** "10 minutes" / "ten minutes" / "an hour" / "half an hour" → seconds, or null. */
export function parseDuration(text) {
  const t = normalize(text)
  if (/\bhalf an? hour\b/.test(t)) return 1800

  const m = /(?:^|\s)(\d+(?:\.\d+)?|[a-z]+)[\s-]*(seconds?|secs?|minutes?|mins?|hours?)\b/.exec(t)
  if (!m) return null
  const unit = UNIT_SECONDS[m[2].replace(/s$/, '')]
  if (!unit) return null
  const n = /^\d/.test(m[1]) ? parseFloat(m[1]) : NUMBER_WORDS[m[1]]
  if (n === undefined || !(n > 0)) return null
  return Math.round(n * unit)
}

// Trailing filler that isn't part of a place name ("…in Tokyo right now").
const TRAILING_FILLER = /\s+(?:right now|now|today|tonight|currently|at the moment|outside|please)\s*$/

/**
 * Parse a command into a fast-path intent, or null if it needs Claude.
 *   { type: 'time' }
 *   { type: 'timer', seconds, label }
 *   { type: 'weather', location }   // location '' → use the profile's location
 */
export function parseIntent(text) {
  const t = normalize(text)

  // --- time --- ("what time is it", "what's the time"). A trailing "in <place>" is a
  // timezone question — Claude's job.
  if (/^(?:hey |ok |okay )?what(?:'s| is)? (?:the )?(?:current )?time(?: is it)?(?: right now| now)?$/.test(t) ||
      /^what time is it(?: right now| now)?$/.test(t)) {
    return { type: 'time' }
  }

  // --- timer --- ("set a timer for ten minutes", "timer for 5 minutes", "set a
  // 10 minute timer"). Unparseable durations fall through to Claude.
  if (/\btimer\b/.test(t) && /^(?:please )?(?:set|start|put on|create|make)?\s*(?:a |the |me a )?.*timer/.test(t)) {
    const seconds = parseDuration(t)
    if (seconds) {
      const label = /for (?:the |my )?([a-z]+)$/.exec(t.replace(TRAILING_FILLER, ''))
      const word = label?.[1]
      const isUnit = word && /^(seconds?|secs?|minutes?|mins?|hours?)$/.test(word)
      return { type: 'timer', seconds, label: word && !isUnit && !NUMBER_WORDS[word] ? word : null }
    }
  }

  // --- weather --- ("what's the weather", "weather in washington dc", "how hot is it",
  // "what's the temperature in tokyo"). No location → '' (caller uses the profile's).
  if (/\b(?:weather|temperature|forecast)\b/.test(t) || /\bhow (?:hot|cold|warm) is it\b/.test(t)) {
    // Questions about the past/future beyond "now" go to Claude ("will it rain tomorrow").
    if (/\b(?:tomorrow|yesterday|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|will it|going to)\b/.test(t)) {
      return null
    }
    const cleaned = t.replace(TRAILING_FILLER, '')
    const loc = /\b(?:in|for|at) ((?:[a-z']+ ?)+)$/.exec(cleaned)
    return { type: 'weather', location: loc ? loc[1].trim() : '' }
  }

  return null
}
