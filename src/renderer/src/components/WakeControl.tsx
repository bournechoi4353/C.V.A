import { useEffect, useRef } from 'react'
import { WakeListener, detectWake, chime, looksLikeNoise } from '../wake'
import { sendUserText } from '../conversation'
import { setLevel } from '../level'
import { useStore } from '../store'

const BARE_WAKE_WINDOW_MS = 8000 // "Claude." alone → wait this long for the command
const FOLLOW_UP_WINDOW_MS = 12000 // Claude asked a question → wait this long for the answer

// Headless: runs the always-on wake listener while wakeMode is on. Each utterance is
// transcribed locally; if it starts with the name, the rest becomes the command. After a
// reply that ends in a question ("In what location?") the mic stays armed — the next
// utterance is taken as the answer directly, no re-wake needed, so a clarifying exchange
// flows like a conversation.
export default function WakeControl() {
  const wakeMode = useStore((s) => s.wakeMode)
  const listenerRef = useRef<WakeListener | null>(null)
  const awaitingRef = useRef(false)
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const disarm = () => {
      if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current)
      awaitingTimerRef.current = null
      if (awaitingRef.current) {
        awaitingRef.current = false
        useStore.getState().setToast(null)
      }
    }

    if (!wakeMode) {
      listenerRef.current?.stop()
      listenerRef.current = null
      disarm()
      useStore.getState().setWakeHeard(null)
      return
    }

    // Arm "the next utterance is the command" mode (bare wake, or answering a question).
    const arm = (ms: number) => {
      if (awaitingTimerRef.current) clearTimeout(awaitingTimerRef.current)
      awaitingRef.current = true
      useStore.getState().setToast('Listening…')
      awaitingTimerRef.current = setTimeout(disarm, ms)
    }

    // Run a command; if Claude answers with a question, keep the mic armed for the answer.
    const run = async (command: string) => {
      disarm()
      const reply = await sendUserText(command)
      if (reply && /\?\s*$/.test(reply.trim()) && useStore.getState().wakeMode) {
        arm(FOLLOW_UP_WINDOW_MS)
      }
    }

    let cancelled = false
    let reconnects = 0
    const startListener = async (): Promise<void> => {
      const access = await window.cva.requestMic()
      if (access !== 'granted') {
        useStore.getState().setSttError('Mic blocked — enable it in System Settings.')
        useStore.getState().setWakeMode(false)
        return
      }

      const wl = new WakeListener()
      // Mic died (device unplugged/switched): retry a few times, then give up loudly.
      wl.onEnded = () => {
        if (cancelled || listenerRef.current !== wl) return
        wl.stop()
        listenerRef.current = null
        if (reconnects++ < 5) {
          useStore.getState().setToast('Mic disconnected — reconnecting…')
          setTimeout(() => {
            useStore.getState().setToast(null)
            if (!cancelled && useStore.getState().wakeMode) void startListener()
          }, 2000)
        } else {
          useStore.getState().setSttError('Microphone lost — hands-free disabled.')
          useStore.getState().setWakeMode(false)
        }
      }
      wl.onLevel = (lvl) => {
        if (useStore.getState().status === 'idle') setLevel(lvl)
      }
      // Speculative transcription: starts at ~256ms of trailing silence, so by the time
      // the ~512ms endpoint confirms, the transcript is (nearly) ready — STT costs ~0
      // extra wall-clock. Discarded if the speaker resumed (speechFrames moved on).
      let early: { speech: number; promise: Promise<string> } | null = null
      wl.onEarlyUtterance = (audio, speechFrames) => {
        if (useStore.getState().status !== 'idle') return
        early = {
          speech: speechFrames,
          promise: window.cva
            .transcribe(audio)
            .then((r) => (r.text ?? '').trim())
            .catch(() => ''),
        }
      }
      wl.onUtterance = async (audio, speechFrames) => {
        // Only act when idle — avoids transcribing CVA's own TTS or mid-turn speech.
        const spec = early && early.speech === speechFrames ? early.promise : null
        early = null
        if (useStore.getState().status !== 'idle') return
        let text: string
        if (spec) {
          text = await spec
        } else {
          const res = await window.cva.transcribe(audio)
          text = (res.text ?? '').trim()
        }
        if (!text || looksLikeNoise(text)) return
        useStore.getState().setWakeHeard(text) // show what it heard (debug finickiness)

        if (awaitingRef.current) {
          // Armed: this utterance IS the command/answer. Strip the name if they said it
          // anyway out of habit ("Claude, in Tokyo" → "in Tokyo").
          const { woke, command } = detectWake(text)
          const finalText = woke ? command : text
          if (!finalText) {
            arm(BARE_WAKE_WINDOW_MS) // they just said the name again — keep listening
            return
          }
          await run(finalText)
          return
        }

        const { woke, command } = detectWake(text)
        if (!woke) return
        chime()
        if (command) await run(command)
        else arm(BARE_WAKE_WINDOW_MS) // bare "Claude" — take the next utterance as the command
      }

      try {
        await wl.start()
        if (cancelled) wl.stop()
        else listenerRef.current = wl
      } catch (err) {
        useStore.getState().setSttError(err instanceof Error ? err.message : String(err))
        useStore.getState().setWakeMode(false)
      }
    }
    void startListener()

    return () => {
      cancelled = true
      listenerRef.current?.stop()
      listenerRef.current = null
      disarm()
    }
  }, [wakeMode])

  return null
}
