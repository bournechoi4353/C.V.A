// Speech-to-text manager: spawns + drives the system-Node STT worker (see stt-worker.mjs
// for why STT can't run in Electron's own runtime). Keeps the worker warm so transcription
// is fast, and respawns it if it dies.

import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { app } from 'electron'

let worker: ChildProcess | null = null
let readyPromise: Promise<void> | null = null
let reqId = 0
const pending = new Map<number, { resolve: (text: string) => void; reject: (err: unknown) => void }>()

let onProgress: ((percent: number) => void) | null = null
export function setSttProgress(fn: (percent: number) => void): void {
  onProgress = fn
}

function workerPath(): string {
  // In dev this is <project>/src/main/stt-worker.mjs. (Packaging will need to bundle it.)
  return join(app.getAppPath(), 'src', 'main', 'stt-worker.mjs')
}

function startWorker(): Promise<void> {
  if (readyPromise) return readyPromise

  readyPromise = new Promise<void>((resolve, reject) => {
    // 'node' = the user's system Node (NOT Electron) — onnxruntime-node runs fine there.
    const w = spawn('node', [workerPath()], {
      cwd: app.getAppPath(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    worker = w

    let buf = ''
    w.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line.trim()) continue
        let msg: { type: string; id?: number; text?: string; message?: string; progress?: number }
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg.type === 'ready') resolve()
        else if (msg.type === 'progress' && typeof msg.progress === 'number') onProgress?.(msg.progress)
        else if (msg.type === 'result' && msg.id !== undefined) {
          pending.get(msg.id)?.resolve(msg.text ?? '')
          pending.delete(msg.id)
        } else if (msg.type === 'error' && msg.id !== undefined) {
          pending.get(msg.id)?.reject(new Error(msg.message ?? 'transcription failed'))
          pending.delete(msg.id)
        } else if (msg.type === 'fatal') {
          reject(new Error(msg.message ?? 'STT worker failed to start'))
        }
      }
    })

    w.stderr?.on('data', (d: Buffer) => console.error('[stt-worker]', d.toString().trim()))
    w.on('error', (e) => reject(e))
    w.on('exit', (code) => {
      console.error('[stt-worker] exited with code', code)
      worker = null
      readyPromise = null
      for (const p of pending.values()) p.reject(new Error('STT worker exited'))
      pending.clear()
    })
  })

  return readyPromise
}

export async function ensureStt(): Promise<void> {
  await startWorker()
}

/** Transcribe mono 16kHz Float32 audio. */
export async function transcribe(samples: Float32Array): Promise<string> {
  await startWorker()
  const id = reqId++
  const file = join(tmpdir(), `cva-stt-${process.pid}-${id}.f32`)
  await writeFile(file, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength))
  try {
    return await new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker!.stdin!.write(JSON.stringify({ type: 'transcribe', id, file }) + '\n')
    })
  } catch (err) {
    unlink(file).catch(() => {})
    throw err
  }
}
