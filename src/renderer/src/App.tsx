import { useEffect } from 'react'
import HUD from './components/HUD'
import { loadStt } from './stt'
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

  // Warm up the local speech models in the background on launch.
  useEffect(() => {
    loadStt((p) => setSttProgress(p))
      .then(() => setSttReady(true))
      .catch((err) => setSttError(err instanceof Error ? err.message : String(err)))

    window.cva
      .ttsEnsure()
      .then((r) => (r.ok ? setTtsReady(true) : setTtsError(r.error ?? 'failed')))
      .catch((err) => setTtsError(err instanceof Error ? err.message : String(err)))
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
