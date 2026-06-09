// Speech-to-text worker — runs in a SEPARATE system-Node process (NOT Electron's
// runtime), because onnxruntime-node crashes (SIGTRAP) when running Whisper under
// Electron's ABI. System Node runs it fine. The Electron main process spawns this and
// talks to it over stdin/stdout (line-delimited JSON); audio is passed via a temp file.
//
// Protocol:
//   in  (stdin):  {"type":"transcribe","id":N,"file":"/path/to/raw-f32"}
//   out (stdout): {"type":"ready"} | {"type":"progress","progress":0-100}
//                 {"type":"result","id":N,"text":"..."} | {"type":"error","id":N,"message":"..."}
//                 {"type":"fatal","message":"..."}

import { pipeline } from '@huggingface/transformers'
import fs from 'node:fs'
import readline from 'node:readline'

const MODEL = 'Xenova/whisper-small.en'

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

let transcriber = null

async function load() {
  transcriber = await pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8', // ~250MB; good accuracy, fast on native CPU
    progress_callback: (info) => {
      if (typeof info?.progress === 'number') send({ type: 'progress', progress: info.progress })
    },
  })
  send({ type: 'ready' })
}

// If the parent (Electron main) dies — e.g. an electron-vite hot-restart — our stdin
// pipe closes; exit so we don't linger as an orphan holding the model in memory.
process.stdin.on('end', () => process.exit(0))
process.stdin.on('close', () => process.exit(0))

const rl = readline.createInterface({ input: process.stdin })
rl.on('close', () => process.exit(0))
rl.on('line', async (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.type !== 'transcribe') return

  try {
    // Raw little-endian Float32, 16kHz mono. Copy into an aligned ArrayBuffer.
    const buf = fs.readFileSync(msg.file)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const samples = new Float32Array(ab)
    const out = await transcriber(samples)
    send({ type: 'result', id: msg.id, text: (out.text ?? '').trim() })
  } catch (e) {
    send({ type: 'error', id: msg.id, message: e?.message || String(e) })
  } finally {
    fs.promises.unlink(msg.file).catch(() => {})
  }
})

load().catch((e) => {
  send({ type: 'fatal', message: e?.message || String(e) })
  process.exit(1)
})
