// Microphone capture for push-to-talk.
//
// While recording it reports a live amplitude level (0..1) for the orb, and on stop it
// returns the captured audio decoded to mono 16kHz Float32 — exactly what Whisper wants.

export class Recorder {
  private stream?: MediaStream
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private liveCtx?: AudioContext
  private analyser?: AnalyserNode
  private rafId?: number

  /** Called ~60x/sec while recording with a 0..1 amplitude level. */
  onLevel?: (level: number) => void

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start()

    // Live amplitude meter for the orb.
    this.liveCtx = new AudioContext()
    const source = this.liveCtx.createMediaStreamSource(this.stream)
    this.analyser = this.liveCtx.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)

    const buf = new Uint8Array(this.analyser.frequencyBinCount)
    const tick = () => {
      this.analyser!.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      this.onLevel?.(Math.min(1, rms * 3))
      this.rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  /** Stop recording; resolves with mono 16kHz Float32 audio. */
  async stop(): Promise<Float32Array> {
    if (this.rafId !== undefined) cancelAnimationFrame(this.rafId)
    this.onLevel?.(0)

    const blob = await new Promise<Blob>((resolve) => {
      this.recorder!.onstop = () =>
        resolve(new Blob(this.chunks, { type: this.recorder!.mimeType }))
      this.recorder!.stop()
    })

    this.stream?.getTracks().forEach((t) => t.stop())
    await this.liveCtx?.close()

    // Decode + resample to 16kHz mono by decoding into a 16kHz context.
    const arrayBuf = await blob.arrayBuffer()
    const decodeCtx = new AudioContext({ sampleRate: 16000 })
    const audioBuf = await decodeCtx.decodeAudioData(arrayBuf)
    await decodeCtx.close()
    return audioBuf.getChannelData(0).slice()
  }
}
