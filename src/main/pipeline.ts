// Streaming voice pipeline (the latency win).
//
// As Claude streams its reply, we split the text into sentences the moment each one
// completes, synthesize that sentence with Kokoro right away, and emit the audio to the
// renderer — so sentence 1 starts playing while Claude is still writing sentence 2 and
// Kokoro pipelines the rest. First audio lands near time-to-first-sentence instead of
// (full reply + full synthesis).

import { ask } from './cva'
import { synthesize } from './tts'

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

export async function streamTurn(
  prompt: string,
  send: (channel: string, payload: unknown) => void,
  shouldCancel: () => boolean,
): Promise<string> {
  let buffer = ''
  let seq = 0
  let synthChain: Promise<void> = Promise.resolve()

  const flush = (force: boolean): void => {
    const { sentences, rest } = takeSentences(buffer, force)
    buffer = rest
    for (const sentence of sentences) {
      const spoken = speakable(sentence)
      if (!spoken) continue // nothing to say (e.g. a bare URL) — skip audio
      const mySeq = seq++
      // Chain synth calls so Kokoro runs one sentence at a time, in order, while the
      // Claude stream keeps arriving. Each finished sentence's audio is sent immediately.
      synthChain = synthChain.then(async () => {
        if (shouldCancel()) return
        try {
          const { samples, rate } = await synthesize(spoken)
          if (shouldCancel()) return
          send('cva:turn-audio', { seq: mySeq, samples, rate })
        } catch (err) {
          console.error('[pipeline] synth failed:', err)
        }
      })
    }
  }

  const reply = await ask(
    prompt,
    (delta) => {
      if (shouldCancel()) return
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
  return reply.text
}
