// Microphone capture for push-to-talk.
//
// Captures raw Float32 PCM straight from a 16kHz AudioContext (same approach as the wake
// listener) — on release the audio is already exactly what Whisper wants, so stop() is
// instant. The old MediaRecorder path encoded to opus and then decoded + resampled the
// whole clip AFTER release, which added dead time that grew with clip length.

const SAMPLE_RATE = 16000
const BUFFER = 2048 // 128ms frames

export class Recorder {
  private stream?: MediaStream
  private ctx?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private processor?: ScriptProcessorNode
  private frames: Float32Array[] = []

  /** Called per audio frame while recording with a 0..1 amplitude level. */
  onLevel?: (level: number) => void

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(BUFFER, 1, 1)
    this.frames = []

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      this.frames.push(new Float32Array(input))

      let sum = 0
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
      this.onLevel?.(Math.min(1, Math.sqrt(sum / input.length) * 3))
    }

    this.source.connect(this.processor)
    // ScriptProcessor only fires when connected to a destination; we never write its
    // output buffer, so this stays silent (no feedback).
    this.processor.connect(this.ctx.destination)
  }

  /** Stop recording; resolves immediately with mono 16kHz Float32 audio. */
  async stop(): Promise<Float32Array> {
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
    } catch {
      /* already disconnected */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close().catch(() => {})
    this.onLevel?.(0)

    let len = 0
    for (const f of this.frames) len += f.length
    const out = new Float32Array(len)
    let o = 0
    for (const f of this.frames) {
      out.set(f, o)
      o += f.length
    }

    this.frames = []
    this.processor = undefined
    this.source = undefined
    this.ctx = undefined
    this.stream = undefined
    return out
  }
}
