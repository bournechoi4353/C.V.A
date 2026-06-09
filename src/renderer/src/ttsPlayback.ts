// Gapless audio queue for the streaming pipeline. Per-sentence audio chunks arrive over
// time; we play them back-to-back via Web Audio, drive the orb amplitude from the live
// output, and expose stop (barge-in) + drain-wait.

import { setLevel } from './level'

interface Chunk {
  samples: Float32Array
  rate: number
}

let queue: Chunk[] = []
let playing = false
let ctx: AudioContext | null = null
let activeSource: AudioBufferSourceNode | null = null
let raf = 0
let drainResolvers: Array<() => void> = []

function resolveDrain() {
  const rs = drainResolvers
  drainResolvers = []
  rs.forEach((r) => r())
}

export function enqueueAudio(samples: Float32Array, rate: number): void {
  queue.push({ samples, rate })
  if (!playing) void playNext()
}

function playNext(): void {
  const chunk = queue.shift()
  if (!chunk) {
    playing = false
    setLevel(0)
    resolveDrain()
    return
  }
  playing = true

  if (!ctx) ctx = new AudioContext()
  const audioCtx = ctx

  const buffer = audioCtx.createBuffer(1, chunk.samples.length, chunk.rate)
  buffer.getChannelData(0).set(chunk.samples)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  activeSource = source

  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  analyser.connect(audioCtx.destination)

  const data = new Uint8Array(analyser.frequencyBinCount)
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3))
    raf = requestAnimationFrame(tick)
  }

  source.onended = () => {
    cancelAnimationFrame(raf)
    if (activeSource === source) activeSource = null
    playNext()
  }

  // Resume in case the context started suspended (autoplay policy).
  audioCtx.resume().finally(() => {
    source.start()
    tick()
  })
}

/** Stop playback and clear the queue (barge-in). */
export function stopAudioQueue(): void {
  queue = []
  cancelAnimationFrame(raf)
  try {
    activeSource?.stop()
  } catch {
    /* already stopped */
  }
  activeSource = null
  playing = false
  setLevel(0)
  resolveDrain()
}

/** Resolves once the queue has fully drained (or was stopped). */
export function audioQueueIdle(): Promise<void> {
  if (!playing && queue.length === 0) return Promise.resolve()
  return new Promise((resolve) => drainResolvers.push(resolve))
}
