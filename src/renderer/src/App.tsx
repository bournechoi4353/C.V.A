import { useEffect } from 'react'
import HUD from './components/HUD'
import { enqueueAudio } from './ttsPlayback'
import { useStore } from './store'

export default function App() {
  const setSttReady = useStore((s) => s.setSttReady)
  const setSttProgress = useStore((s) => s.setSttProgress)
  const setSttError = useStore((s) => s.setSttError)
  const setTtsReady = useStore((s) => s.setTtsReady)
  const setTtsError = useStore((s) => s.setTtsError)
  const setWeather = useStore((s) => s.setWeather)
  const setToast = useStore((s) => s.setToast)

  // Warm up the speech models in the background on launch. Retry a few times so a
  // hot-reload race (renderer up before main's IPC handlers register) self-heals.
  useEffect(() => {
    const offProgress = window.cva.onSttProgress((p) => setSttProgress(p.progress))

    async function ensure<T>(fn: () => Promise<T>): Promise<T> {
      let lastErr: unknown
      for (let i = 0; i < 6; i++) {
        try {
          return await fn()
        } catch (err) {
          lastErr = err
          await new Promise((r) => setTimeout(r, 400))
        }
      }
      throw lastErr
    }

    ensure(() => window.cva.sttEnsure())
      .then((r) => (r.ok ? setSttReady(true) : setSttError(r.error ?? 'failed')))
      .catch((err) => setSttError(err instanceof Error ? err.message : String(err)))

    ensure(() => window.cva.ttsEnsure())
      .then((r) => (r.ok ? setTtsReady(true) : setTtsError(r.error ?? 'failed')))
      .catch((err) => setTtsError(err instanceof Error ? err.message : String(err)))

    return () => offProgress()
  }, [setSttReady, setSttProgress, setSttError, setTtsReady, setTtsError])

  // Tool side-channels: weather card + timer alerts.
  useEffect(() => {
    const offWeather = window.cva.onWeather((w) => setWeather(w))
    const offTimer = window.cva.onTimerFire((t) => {
      setToast(`⏰ ${t.phrase}`)
      if (t.samples && t.rate) enqueueAudio(t.samples, t.rate)
      setTimeout(() => setToast(null), 6000)
    })
    return () => {
      offWeather()
      offTimer()
    }
  }, [setWeather, setToast])

  return <HUD />
}
