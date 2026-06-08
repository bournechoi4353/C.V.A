// Local speech-to-text with Whisper via transformers.js.
//
// Runs fully in the renderer, offline after first load. No API key, no cost — the
// model downloads once from the Hugging Face hub and is cached by the browser.
// (Honors the project's "subscription / free, not paid API" preference.)

import { pipeline, env } from '@huggingface/transformers'

// Serve the onnxruntime runtime locally. scripts/copy-ort.mjs copies the .mjs loaders +
// .wasm into the renderer's public dir (/ort/), so they load same-origin — which avoids
// CSP issues with dynamically imported modules and any CDN/version dependency.
const wasm = env.backends?.onnx?.wasm
if (wasm) {
  wasm.wasmPaths = new URL('ort/', window.location.href).href
  // Single-threaded avoids needing SharedArrayBuffer (needs COOP/COEP headers).
  wasm.numThreads = 1
}
// Always fetch from the hub + browser cache; we don't ship local model files.
env.allowLocalModels = false

// English-only tiny model: ~40MB, fast on WASM, good enough for spoken commands.
const MODEL_ID = 'Xenova/whisper-tiny.en'

export type SttProgress = (percent: number) => void

// dtype order matters. Verified against this onnxruntime-web build:
//   q4   → encoder+decoder load & run, ~same accuracy as fp32, smallest/fastest.
//   fp32 → reference precision, always works (fallback).
// The int8/q8 ("quantized")/uint8 variants and fp16 encoder CRASH this runtime
// (qdq_actions MatMulNBits / graph_utils errors), so they're deliberately excluded.
const DTYPES = ['q4', 'fp32'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null

async function build(onProgress?: SttProgress) {
  let lastErr: unknown
  for (const dtype of DTYPES) {
    try {
      console.log(`[stt] loading ${MODEL_ID} (dtype=${dtype})…`)
      const pipe = await pipeline('automatic-speech-recognition', MODEL_ID, {
        dtype,
        device: 'wasm',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (info: any) => {
          if (typeof info?.progress === 'number') onProgress?.(info.progress)
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      console.log(`[stt] ready (dtype=${dtype})`)
      return pipe
    } catch (err) {
      console.warn(`[stt] dtype "${dtype}" failed, trying next:`, err)
      lastErr = err
    }
  }
  throw lastErr
}

/** Load (and cache) the Whisper pipeline. Safe to call repeatedly. */
export function loadStt(onProgress?: SttProgress) {
  if (!pipePromise) {
    pipePromise = build(onProgress).catch((err) => {
      pipePromise = null // allow a later retry
      throw err
    })
  }
  return pipePromise
}

/** Transcribe mono 16kHz Float32 audio to text. */
export async function transcribe(audio: Float32Array): Promise<string> {
  const transcriber = await loadStt()
  const out = await transcriber(audio)
  const text = Array.isArray(out)
    ? out.map((o: { text?: string }) => o.text ?? '').join(' ')
    : (out?.text ?? '')
  return text.trim()
}
