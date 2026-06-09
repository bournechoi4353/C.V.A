// Hands-free wake-word listening, built on the speech stack we already have (no extra
// engine, no API key, no native deps). A continuous energy-gated VAD captures each spoken
// utterance; we transcribe it locally with the Whisper sidecar and fuzzy-match the wake
// phrase ("Hey computah" → "hey comp…"). All detection is local; only the command (after
// the wake phrase) is ever sent onward.

const SAMPLE_RATE = 16000
const BUFFER = 2048 // 128ms frames
const FRAME_MS = (BUFFER / SAMPLE_RATE) * 1000
const ONSET_RMS = 0.012 // speech start threshold (sensitive; min-speech gate rejects blips)
const HANG_FRAMES = Math.round(650 / FRAME_MS) // ~0.65s of silence ends an utterance
const MIN_SPEECH_FRAMES = Math.round(250 / FRAME_MS) // ignore < ~250ms blips
const MAX_FRAMES = Math.round(10000 / FRAME_MS) // cap utterances at ~10s

function concat(frames: Float32Array[]): Float32Array {
  let len = 0
  for (const f of frames) len += f.length
  const out = new Float32Array(len)
  let o = 0
  for (const f of frames) {
    out.set(f, o)
    o += f.length
  }
  return out
}

// "Hey computah" / "hey computer" and the many ways Whisper actually renders it
// (computer, computa, computah, komputa, commuter, …). Broad on purpose — wake-misses
// are more annoying than the rare false positive, and we only act while idle.
const WAKE_RE = /\b(?:hey|hay|hi|ay|he|yo|okay|ok|a)\s+(?:comp|komp|cump|kahmp|comm|kom)\w*/i

export function detectWake(text: string): { woke: boolean; command: string } {
  const norm = text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = WAKE_RE.exec(norm)
  if (!m) return { woke: false, command: '' }
  const command = norm.slice((m.index ?? 0) + m[0].length).trim()
  return { woke: true, command }
}

/** A short two-tone acknowledgement chime. */
export function chime(): void {
  const ctx = new AudioContext()
  const now = ctx.currentTime
  ;[660, 990].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)
    const t = now + i * 0.11
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    osc.start(t)
    osc.stop(t + 0.18)
  })
  setTimeout(() => ctx.close().catch(() => {}), 600)
}

export class WakeListener {
  private stream?: MediaStream
  private ctx?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private processor?: ScriptProcessorNode

  private speaking = false
  private silence = 0
  private speech = 0
  private frames: Float32Array[] = []
  private preroll: Float32Array[] = []

  /** Live amplitude (0..1) for the UI. */
  onLevel?: (level: number) => void
  /** Called with mono 16kHz Float32 audio for each completed utterance. */
  onUtterance?: (audio: Float32Array) => void

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(BUFFER, 1, 1)

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const frame = new Float32Array(input)

      let sum = 0
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
      const rms = Math.sqrt(sum / input.length)
      this.onLevel?.(Math.min(1, rms * 3))

      // keep a 2-frame pre-roll so we don't clip the start of "hey"
      this.preroll.push(frame)
      if (this.preroll.length > 2) this.preroll.shift()

      if (rms > ONSET_RMS) {
        if (!this.speaking) {
          this.speaking = true
          this.frames = [...this.preroll]
        } else {
          this.frames.push(frame)
        }
        this.silence = 0
        this.speech++
      } else if (this.speaking) {
        this.frames.push(frame)
        this.silence++
        if (this.silence >= HANG_FRAMES || this.frames.length >= MAX_FRAMES) {
          this.endUtterance()
        }
      }
    }

    this.source.connect(this.processor)
    // ScriptProcessor only runs when connected to a destination; we never write its
    // output buffer, so this stays silent (no feedback).
    this.processor.connect(this.ctx.destination)
  }

  private endUtterance(): void {
    const enough = this.speech >= MIN_SPEECH_FRAMES
    const audio = enough ? concat(this.frames) : null
    this.speaking = false
    this.silence = 0
    this.speech = 0
    this.frames = []
    this.onLevel?.(0)
    if (audio) this.onUtterance?.(audio)
  }

  stop(): void {
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close().catch(() => {})
    this.processor = undefined
    this.source = undefined
    this.ctx = undefined
    this.stream = undefined
    this.onLevel?.(0)
  }
}
