import { useEffect, useRef } from 'react'
import { WakeListener, detectWake, chime } from '../wake'
import { sendUserText } from '../conversation'
import { setLevel } from '../level'
import { useStore } from '../store'

// Headless: runs the always-on wake listener while wakeMode is on. Each utterance is
// transcribed locally; if it starts with the wake phrase, the rest becomes the command.
export default function WakeControl() {
  const wakeMode = useStore((s) => s.wakeMode)
  const listenerRef = useRef<WakeListener | null>(null)
  const awaitingRef = useRef(false)

  useEffect(() => {
    if (!wakeMode) {
      listenerRef.current?.stop()
      listenerRef.current = null
      awaitingRef.current = false
      useStore.getState().setWakeHeard(null)
      return
    }

    let cancelled = false
    ;(async () => {
      const access = await window.cva.requestMic()
      if (access !== 'granted') {
        useStore.getState().setSttError('Mic blocked — enable it in System Settings.')
        useStore.getState().setWakeMode(false)
        return
      }

      const wl = new WakeListener()
      wl.onLevel = (lvl) => {
        if (useStore.getState().status === 'idle') setLevel(lvl)
      }
      wl.onUtterance = async (audio) => {
        // Only act when idle — avoids transcribing CVA's own TTS or mid-turn speech.
        if (useStore.getState().status !== 'idle') return
        const res = await window.cva.transcribe(audio)
        const text = (res.text ?? '').trim()
        if (!text) return
        useStore.getState().setWakeHeard(text) // show what it heard (debug finickiness)

        if (awaitingRef.current) {
          awaitingRef.current = false
          useStore.getState().setToast(null)
          await sendUserText(text)
          return
        }

        const { woke, command } = detectWake(text)
        if (!woke) return
        chime()
        if (command) {
          await sendUserText(command)
        } else {
          // Bare "Hey computah" — take the next utterance as the command.
          awaitingRef.current = true
          useStore.getState().setToast('Listening…')
          setTimeout(() => {
            if (awaitingRef.current) {
              awaitingRef.current = false
              useStore.getState().setToast(null)
            }
          }, 6000)
        }
      }

      try {
        await wl.start()
        if (cancelled) wl.stop()
        else listenerRef.current = wl
      } catch (err) {
        useStore.getState().setSttError(err instanceof Error ? err.message : String(err))
        useStore.getState().setWakeMode(false)
      }
    })()

    return () => {
      cancelled = true
      listenerRef.current?.stop()
      listenerRef.current = null
      awaitingRef.current = false
    }
  }, [wakeMode])

  return null
}
