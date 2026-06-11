// Text-to-speech with Kokoro (local neural TTS) in the main process.
//
// Runs via kokoro-js → onnxruntime-node (native), which is fast and — verified — loads
// under Electron's N-API ABI without a rebuild. Fully local/free, no API key. The
// generated audio (Float32 PCM) is handed to the renderer over IPC, which plays it via
// Web Audio so the orb can react to real amplitude.

import { log } from './logger'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const VOICE = 'af_heart' // highest-graded (A) Kokoro voice — most natural. Others: af_bella, am_fenrir, bm_george
const DTYPE = 'q8' // verified to load+run on this runtime; ~92MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPromise: Promise<any> | null = null

function getTts() {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      // Model cache note: kokoro-js caches module-relative (inside its nested
      // transformers copy), so the packaged app SHIPS the model — instant first run,
      // fully offline. Do NOT import the top-level @huggingface/transformers in this
      // process to redirect the cache: that loads a second onnxruntime binding and the
      // two ORT versions collide → SIGSEGV in InferenceSessionWrap::LoadModel
      // (observed in packaged-app crash reports).
      const { KokoroTTS } = await import('kokoro-js')
      log('tts', 'loading Kokoro…')
      const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' })
      log('tts', 'ready')
      return tts
    })().catch((err) => {
      ttsPromise = null // allow retry
      throw err
    })
  }
  return ttsPromise
}

/** Warm up the model (download + load). */
export async function ensureTts(): Promise<void> {
  await getTts()
}

export interface Speech {
  samples: Float32Array
  rate: number
}

// Repeated phrases ("Timer set for ten minutes.", timer alerts, greetings) come up a
// lot in a voice assistant — cache synthesized audio so they play instantly. Samples
// are treated as read-only by all consumers. ~24 entries ≈ a few MB.
const ttsCache = new Map<string, Speech>()
const TTS_CACHE_MAX = 24

/** Synthesize speech for text. Returns mono Float32 PCM + sample rate. */
export async function synthesize(text: string): Promise<Speech> {
  const key = `${VOICE}|${text}`
  const hit = ttsCache.get(key)
  if (hit) {
    ttsCache.delete(key) // LRU: re-insert as most recent
    ttsCache.set(key, hit)
    log('timing', `tts cache hit (${text.length} chars)`)
    return hit
  }

  const tts = await getTts()
  const t0 = Date.now()
  const audio = await tts.generate(text, { voice: VOICE })
  const samples = audio.audio as Float32Array
  const rate = audio.sampling_rate as number
  log(
    'timing',
    `tts ${((Date.now() - t0) / 1000).toFixed(2)}s for ${(samples.length / rate).toFixed(1)}s audio (${text.length} chars)`,
  )

  const speech = { samples, rate }
  ttsCache.set(key, speech)
  if (ttsCache.size > TTS_CACHE_MAX) {
    ttsCache.delete(ttsCache.keys().next().value as string) // evict least-recent
  }
  return speech
}

/** Float32 PCM [-1,1] → Int16 PCM. Halves the IPC payload; the difference is inaudible
 *  (16-bit is CD quality — well past what a q8 TTS model resolves). */
export function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(-1, Math.min(1, f[i]))
    out[i] = (v * 0x7fff) | 0
  }
  return out
}
