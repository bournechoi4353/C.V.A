// Text-to-speech with Kokoro (local neural TTS) in the main process.
//
// Runs via kokoro-js → onnxruntime-node (native), which is fast and — verified — loads
// under Electron's N-API ABI without a rebuild. Fully local/free, no API key. The
// generated audio (Float32 PCM) is handed to the renderer over IPC, which plays it via
// Web Audio so the orb can react to real amplitude.

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const VOICE = 'bm_george' // British male — Jarvis-ish. Other options: bm_lewis, am_michael
const DTYPE = 'q8' // verified to load+run on this runtime; ~92MB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPromise: Promise<any> | null = null

function getTts() {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const { KokoroTTS } = await import('kokoro-js')
      console.log('[tts] loading Kokoro…')
      const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' })
      console.log('[tts] ready')
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

/** Synthesize speech for text. Returns mono Float32 PCM + sample rate. */
export async function synthesize(text: string): Promise<Speech> {
  const tts = await getTts()
  const audio = await tts.generate(text, { voice: VOICE })
  return { samples: audio.audio as Float32Array, rate: audio.sampling_rate as number }
}
