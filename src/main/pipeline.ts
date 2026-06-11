// Streaming voice pipeline (the latency win).
//
// As Claude streams its reply, we split the text into sentences the moment each one
// completes, synthesize that sentence with Kokoro right away, and emit the audio to the
// renderer — so sentence 1 starts playing while Claude is still writing sentence 2 and
// Kokoro pipelines the rest. First audio lands near time-to-first-sentence instead of
// (full reply + full synthesis). Before the FIRST sentence completes we go further and
// speak its opening clause (cut at a comma) so a long first sentence can't delay audio.

import { ask } from './cva'
import { synthesize, floatToInt16 } from './tts'
import { log } from './logger'

// Make a sentence safe to speak: markdown links → their text, bare URLs/markdown
// artifacts dropped. Returns '' if nothing speakable remains (e.g. a lone URL).
function speakable(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/https?:\/\/\S+/g, '') // bare URLs
    .replace(/[*_`#>]/g, '') // stray markdown
    .replace(/\s+/g, ' ')
    .trim()
}

// Pull complete sentences out of a growing buffer. A sentence boundary is .!? (one or
// more) followed by whitespace — requiring the trailing space avoids splitting
// mid-stream and avoids splitting decimals like "3.5" or abbreviations where the dot
// isn't followed by a space. On `force` (end of stream) the remainder is flushed as the
// final sentence. Walks char-by-char so text before a non-boundary dot is never dropped.
function takeSentences(buffer: string, force: boolean): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  let start = 0

  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i]
    if (c !== '.' && c !== '!' && c !== '?') continue

    // consume a run of consecutive terminal punctuation (e.g. "?!", "...")
    let j = i
    while (j + 1 < buffer.length && '.!?'.includes(buffer[j + 1])) j++

    const next = buffer[j + 1]
    if (next === undefined) break // punctuation at buffer end — wait for more (or force handles it)
    if (/\s/.test(next)) {
      const s = buffer.slice(start, j + 1).trim()
      if (s) sentences.push(s)
      start = j + 1
    }
    i = j // skip past the punctuation run
  }

  let rest = buffer.slice(start)
  if (force && rest.trim()) {
    sentences.push(rest.trim())
    rest = ''
  }
  return { sentences, rest }
}

// First-audio accelerator: until the first chunk has been queued for synthesis, a long
// opening sentence can be cut early at a clause boundary (",;:—" followed by a space —
// the space requirement protects numbers like "1,000"). Min length avoids speaking a
// stub so short the prosody break would be jarring.
const FIRST_CLAUSE_MIN = 12
function firstClauseCut(buffer: string): number {
  for (let i = FIRST_CLAUSE_MIN; i < buffer.length - 1; i++) {
    const c = buffer[i]
    if ((c === ',' || c === ';' || c === ':' || c === '—') && /\s/.test(buffer[i + 1])) {
      return i + 1
    }
  }
  return -1
}

export async function streamTurn(
  prompt: string,
  send: (channel: string, payload: unknown) => void,
  shouldCancel: () => boolean,
): Promise<string> {
  let buffer = ''
  let seq = 0
  let synthChain: Promise<void> = Promise.resolve()

  // Per-leg timing — the Phase 8 latency budget. Logged at end of turn.
  const t0 = Date.now()
  let tFirstToken = 0
  let tFirstAudio = 0

  const emit = (text: string): void => {
    const spoken = speakable(text)
    if (!spoken) return // nothing to say (e.g. a bare URL) — skip audio
    const mySeq = seq++
    // Chain synth calls so Kokoro runs one chunk at a time, in order, while the
    // Claude stream keeps arriving. Each finished chunk's audio is sent immediately.
    synthChain = synthChain.then(async () => {
      if (shouldCancel()) return
      try {
        const { samples, rate } = await synthesize(spoken)
        if (shouldCancel()) return
        if (!tFirstAudio) tFirstAudio = Date.now()
        // Int16 halves the IPC copy vs Float32; the renderer converts back on playback.
        send('cva:turn-audio', { seq: mySeq, samples: floatToInt16(samples), rate })
      } catch (err) {
        log('error', `synth failed: ${err instanceof Error ? err.message : err}`)
      }
    })
  }

  const flush = (force: boolean): void => {
    const { sentences, rest } = takeSentences(buffer, force)
    buffer = rest
    for (const sentence of sentences) emit(sentence)
    // Nothing queued yet? Speak the opening clause early instead of waiting out a long
    // first sentence — first audio is what latency feels like.
    if (seq === 0 && !force) {
      const cut = firstClauseCut(buffer)
      if (cut > 0) {
        const clause = buffer.slice(0, cut)
        buffer = buffer.slice(cut)
        emit(clause)
      }
    }
  }

  const reply = await ask(
    prompt,
    (delta) => {
      if (shouldCancel()) return
      if (!tFirstToken) tFirstToken = Date.now()
      buffer += delta
      send('cva:turn-text', { delta })
      flush(false)
    },
    (toolName) => {
      if (shouldCancel()) return
      send('cva:turn-tool', { name: toolName })
    },
  )

  flush(true) // synthesize the trailing sentence
  await synthChain // wait until every sentence's audio has been emitted

  if (!shouldCancel()) {
    const rel = (t: number) => (t ? `${((t - t0) / 1000).toFixed(2)}s` : 'n/a')
    log(
      'timing',
      `turn: first-token ${rel(tFirstToken)} · first-audio ${rel(tFirstAudio)} · ` +
        `total ${((Date.now() - t0) / 1000).toFixed(2)}s · ${seq} chunk(s)`,
    )
  }
  return reply.text
}
