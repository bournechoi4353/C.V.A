// Plays TTS audio (Float32 PCM from the main process) via Web Audio, and drives the
// orb amplitude (--mic-level) from the live output so the orb pulses with the voice.

function setOrbLevel(level: number) {
  document.documentElement.style.setProperty('--mic-level', String(level))
}

let currentSource: AudioBufferSourceNode | null = null
let currentCtx: AudioContext | null = null

/** Stop any in-progress playback (used for barge-in). */
export function stopPlayback() {
  try {
    currentSource?.stop()
  } catch {
    /* already stopped */
  }
  currentSource = null
  currentCtx?.close().catch(() => {})
  currentCtx = null
  setOrbLevel(0)
}

/** Play mono Float32 PCM at the given sample rate. Resolves when playback ends. */
export function playAudio(samples: Float32Array, rate: number): Promise<void> {
  stopPlayback()
  return new Promise((resolve) => {
    const ctx = new AudioContext()
    currentCtx = ctx

    const buffer = ctx.createBuffer(1, samples.length, rate)
    buffer.getChannelData(0).set(samples)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    currentSource = source

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    analyser.connect(ctx.destination)

    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      setOrbLevel(Math.min(1, Math.sqrt(sum / data.length) * 3))
      raf = requestAnimationFrame(tick)
    }

    const finish = () => {
      cancelAnimationFrame(raf)
      setOrbLevel(0)
      if (currentSource === source) currentSource = null
      if (currentCtx === ctx) currentCtx = null
      ctx.close().catch(() => {})
      resolve()
    }

    source.onended = finish
    // The context can start suspended (autoplay policy) when created outside the direct
    // gesture call stack — resume so audio actually plays.
    ctx.resume().finally(() => {
      source.start()
      tick()
    })
  })
}
