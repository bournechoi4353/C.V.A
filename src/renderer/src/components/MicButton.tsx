import { useEffect, useRef } from 'react'
import { Recorder } from '../audio'
import { transcribe } from '../stt'
import { sendUserText } from '../conversation'
import { stopPlayback } from '../ttsPlayback'
import { useStore } from '../store'

function setMicLevel(level: number) {
  document.documentElement.style.setProperty('--mic-level', String(level))
}

export default function MicButton() {
  const recorderRef = useRef<Recorder | null>(null)
  const recordingRef = useRef(false)

  const status = useStore((s) => s.status)
  const sttReady = useStore((s) => s.sttReady)
  const sttProgress = useStore((s) => s.sttProgress)
  const sttError = useStore((s) => s.sttError)

  async function startRec() {
    const { status: s } = useStore.getState()
    if (recordingRef.current || s === 'thinking' || !useStore.getState().sttReady) return

    // Barge-in: if CVA is speaking, cut it off so the user can talk over it.
    stopPlayback()

    // Trigger / check the OS-level mic permission before capturing.
    const access = await window.cva.requestMic()
    if (access !== 'granted') {
      useStore
        .getState()
        .setSttError(
          'Mic blocked — enable it in System Settings ▸ Privacy & Security ▸ Microphone, then restart.',
        )
      return
    }
    useStore.getState().setSttError(null)

    const rec = new Recorder()
    rec.onLevel = setMicLevel
    recorderRef.current = rec
    try {
      await rec.start()
      recordingRef.current = true
      useStore.getState().setStatus('listening')
    } catch {
      recorderRef.current = null
      useStore.getState().setSttError('Microphone access denied')
    }
  }

  async function stopRec() {
    if (!recordingRef.current) return
    recordingRef.current = false
    const rec = recorderRef.current!
    recorderRef.current = null
    setMicLevel(0)
    useStore.getState().setStatus('thinking')

    try {
      const audio = await rec.stop()
      const text = await transcribe(audio)
      if (!text) {
        useStore.getState().setStatus('idle')
        return
      }
      await sendUserText(text) // sets thinking → idle itself
    } catch (err) {
      useStore.getState().setSttError(err instanceof Error ? err.message : String(err))
      useStore.getState().setStatus('idle')
    }
  }

  // Keep the latest handlers in refs so the global Space listener never goes stale.
  const startRef = useRef(startRec)
  const stopRef = useRef(stopRec)
  startRef.current = startRec
  stopRef.current = stopRec

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTyping()) {
        e.preventDefault()
        startRef.current()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        e.preventDefault()
        stopRef.current()
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  const recording = status === 'listening'
  const busy = status === 'thinking'

  let label: string
  if (!sttReady && sttError) label = '⚠️ voice model failed'
  else if (!sttReady) label = `Loading voice… ${Math.round(sttProgress)}%`
  else if (recording) label = '● Listening — release to send'
  else label = '🎤 Hold to talk  (or hold Space)'

  return (
    <div className="mic-wrap">
      <button
        className={`mic ${recording ? 'mic--on' : ''}`}
        disabled={busy || !sttReady}
        onPointerDown={() => startRef.current()}
        onPointerUp={() => stopRef.current()}
        onPointerLeave={() => {
          if (recordingRef.current) stopRef.current()
        }}
      >
        {label}
      </button>
      {sttError && <div className="mic-error">{sttError}</div>}
    </div>
  )
}
