// STT model benchmark: synthesizes test phrases with Kokoro (the app's own TTS), then
// transcribes them with the old (whisper-small.en) and new (distil-small.en) models —
// comparing speed and checking the wake detector fires on each model's actual output.
//
// Run: node scripts/bench-stt.mjs            (first run downloads distil-small.en, ~170MB)
//      node scripts/bench-stt.mjs --new-only (skip the old model)
//      node scripts/bench-stt.mjs --models a,b,c (bench arbitrary model ids)
//
// Each model runs in its own child process: onnxruntime-node can abort ("mutex lock
// failed") tearing down multiple ORT sessions in one process — the same reason the app
// runs Whisper in a sidecar. The abort can also fire AFTER a successful run during exit
// teardown, so the parent judges success by an output marker, not the exit code.

import { spawnSync } from 'node:child_process'

const OLD_MODEL = 'onnx-community/distil-small.en'
const NEW_MODEL = 'onnx-community/moonshine-base-ONNX'
const OK_MARKER = '__BENCH_MODEL_OK__'

const args = process.argv.slice(2)
const modelIdx = args.indexOf('--model')

if (modelIdx === -1) {
  // ---- Parent: one child per model ----
  const modelsIdx = args.indexOf('--models')
  const models =
    modelsIdx >= 0
      ? args[modelsIdx + 1].split(',')
      : args.includes('--new-only')
        ? [NEW_MODEL]
        : args.includes('--old-only')
          ? [OLD_MODEL]
          : [OLD_MODEL, NEW_MODEL]

  let allOk = true
  for (const model of models) {
    const r = spawnSync(process.execPath, [process.argv[1], '--model', model], {
      encoding: 'utf8',
      timeout: 15 * 60 * 1000,
    })
    process.stdout.write((r.stdout ?? '').replace(OK_MARKER + '\n', ''))
    // Surface real errors but hide the known harmless exit-teardown abort.
    const stderr = (r.stderr ?? '')
      .split('\n')
      .filter((l) => l && !/mutex lock failed|libc\+\+abi/.test(l))
      .join('\n')
    if (stderr) process.stderr.write(stderr + '\n')
    if (!(r.stdout ?? '').includes(OK_MARKER)) allOk = false
  }
  console.log(allOk ? '\nAll wake expectations hold on real model output.' : '\nSome model runs FAILED.')
  process.exit(allOk ? 0 : 1)
}

// ---- Child: bench a single model ----
const MODEL = args[modelIdx + 1]
const { KokoroTTS } = await import('kokoro-js')
const { pipeline } = await import('@huggingface/transformers')
const { detectWake } = await import('../src/shared/wake-detect.mjs')

const PHRASES = [
  { text: 'Claude, what is the weather in Tokyo?', expectWake: true },
  { text: 'Hey Claude.', expectWake: true },
  { text: 'Claude, set a timer for ten minutes.', expectWake: true },
  { text: 'What time is it right now?', expectWake: false },
  { text: 'It is cloudy outside today.', expectWake: false },
]

// Kokoro outputs 24kHz; Whisper wants 16kHz mono. Linear resample is fine for speech.
function resampleTo16k(samples, fromRate) {
  const ratio = fromRate / 16000
  const out = new Float32Array(Math.floor(samples.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, samples.length - 1)
    const frac = pos - lo
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac
  }
  return out
}

console.log(`=== ${MODEL} ===`)
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8',
  device: 'cpu',
})
const clips = []
for (const p of PHRASES) {
  const audio = await tts.generate(p.text, { voice: 'af_heart' })
  const samples = resampleTo16k(audio.audio, audio.sampling_rate)
  clips.push({ ...p, samples, secs: samples.length / 16000 })
}

const t0 = Date.now()
const stt = await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' })
console.log(`  load: ${((Date.now() - t0) / 1000).toFixed(1)}s`)

await stt(clips[0].samples) // warmup (first call pays JIT/alloc overhead)

let ok = true
for (const clip of clips) {
  const times = []
  let text = ''
  for (let i = 0; i < 3; i++) {
    const t = Date.now()
    const out = await stt(clip.samples)
    times.push(Date.now() - t)
    text = (out.text ?? '').trim()
  }
  const best = Math.min(...times)
  const { woke, command } = detectWake(text)
  const wakeOk = woke === clip.expectWake
  if (!wakeOk) ok = false
  console.log(
    `  ${(best / 1000).toFixed(2)}s (${clip.secs.toFixed(1)}s audio) → "${text}"` +
      `  wake=${woke}${command ? ` cmd="${command}"` : ''} ${wakeOk ? '✓' : '✗ EXPECTED wake=' + clip.expectWake}`,
  )
}

if (ok) console.log(OK_MARKER)
process.exit(ok ? 0 : 1)
