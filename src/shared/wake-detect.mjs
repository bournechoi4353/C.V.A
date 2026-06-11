// Wake-phrase detection ("Claude" / "Hey Claude") over Whisper transcripts. Plain JS
// (not TS) so the renderer and the Node test harness (scripts/test-wake.mjs) share the
// exact same logic — what's tested is what ships.
//
// Whisper renders the name many ways (Claude, Claud, Clod, Clawed, Cloud, Klaud,
// Clause, …), so we match in two passes:
//   1. utterance-START name — skip leading greetings/fillers ("hey", "okay", "um"), then
//      a Claude-like word: "Claude, what's the weather", "Hey Claude.", "Um, Claude…"
//   2. greeting + name ANYWHERE — for utterances the VAD glued together:
//      "…so anyway. Hey Claude, what time is it"
// A known-variant list catches the common renderings; an edit-distance net (≤ 1 from
// "claude") catches the rest. Broad on purpose: wake-misses are more annoying than the
// rare false wake, and we only act while the assistant is idle.

const GREETINGS = new Set([
  'hey', 'hay', 'hi', 'he', 'a', 'ay', 'aye', 'eh', 'ey', 'yo', 'ok', 'okay', 'oi',
])

// Leading filler words to skip before the name at utterance start ("Um, Claude…").
const FILLERS = new Set([...GREETINGS, 'um', 'uh', 'so', 'well', 'and', 'oh', 'now'])

// Whisper renderings of "Claude" too far from it in edit distance for the fuzzy net.
const VARIANTS = new Set(['claude', 'claud', 'clod', 'clawed', 'cloud', 'klaud', 'klaude', 'clode'])

/** Classic two-row Levenshtein edit distance. */
export function levenshtein(a, b) {
  if (a === b) return 0
  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // deletion
        cur[j - 1] + 1, // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      )
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

function claudeish(word) {
  if (VARIANTS.has(word)) return true
  // Fuzzy net: "clause", "claude's" stems, odd spellings. Tight (≤ 1) because the name
  // is short — distance 2 would wake on everyday words like "blade" or "cloud-y" forms.
  if (word.length >= 5 && word.length <= 8) {
    return levenshtein(word, 'claude') <= 1
  }
  return false
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detect the wake phrase in a transcript. When woken, `command` is whatever followed
 * the name ("claude what's the weather" → "what's the weather"); empty for a bare wake
 * ("Hey Claude." alone).
 */
export function detectWake(text) {
  const tokens = normalize(text).split(' ').filter(Boolean)

  // Pass 1: the name at the effective start of the utterance (leading fillers skipped).
  let i = 0
  while (i < tokens.length && FILLERS.has(tokens[i])) i++
  if (i < tokens.length && claudeish(tokens[i])) {
    return { woke: true, command: tokens.slice(i + 1).join(' ') }
  }

  // Pass 2: greeting + name anywhere ("…anyway. Hey Claude, what time is it").
  for (let j = 0; j < tokens.length - 1; j++) {
    if (GREETINGS.has(tokens[j]) && claudeish(tokens[j + 1])) {
      return { woke: true, command: tokens.slice(j + 2).join(' ') }
    }
  }

  return { woke: false, command: '' }
}

// Whisper hallucinates these on silence/noise/music — ignore them. (Bracket tokens like
// "[Music]" normalize to the bare word.)
const NOISE_OUT = new Set([
  'you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching',
  'thank you very much', 'thank you so much', 'bye', 'bye bye', 'the end', 'so',
  'see you', 'see you next time', 'please subscribe', 'subscribe',
  'okay', 'ok', 'yeah', 'uh', 'um', 'hmm', 'huh', 'oh', 'mm', 'mmm',
  'all right', 'alright', 'music', 'applause', 'laughter', 'silence',
])

export function looksLikeNoise(text) {
  const t = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length < 2 || NOISE_OUT.has(t)
}
