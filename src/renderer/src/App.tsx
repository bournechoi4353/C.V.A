import { useEffect } from 'react'
import HUD from './components/HUD'
import { enqueueAudio, warmAudioPlayback } from './ttsPlayback'
import { useStore } from './store'

export default function App() {
  const setSttReady = useStore((s) => s.setSttReady)
  const setSttProgress = useStore((s) => s.setSttProgress)
  const setSttError = useStore((s) => s.setSttError)
  const setTtsReady = useStore((s) => s.setTtsReady)
  const setTtsError = useStore((s) => s.setTtsError)
  const setWeather = useStore((s) => s.setWeather)
  const setToast = useStore((s) => s.setToast)
  const setProfile = useStore((s) => s.setProfile)
  const setMemories = useStore((s) => s.setMemories)

  // Warm up the speech models in the background on launch. Retry a few times so a
  // hot-reload race (renderer up before main's IPC handlers register) self-heals.
  useEffect(() => {
    warmAudioPlayback() // pre-create the output AudioContext so first audio starts instantly
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

  // Tool side-channels: weather card + timer alerts + per-turn usage.
  useEffect(() => {
    const offWeather = window.cva.onWeather((w) => setWeather(w))
    const offTimer = window.cva.onTimerFire((t) => {
      setToast(t.phrase)
      if (t.samples && t.rate) enqueueAudio(t.samples, t.rate)
      setTimeout(() => setToast(null), 6000)
    })
    const offUsage = window.cva.onUsage((u) => useStore.getState().addUsage(u))
    return () => {
      offWeather()
      offTimer()
      offUsage()
    }
  }, [setWeather, setToast])

  // Memory & profile: initial fetch (retried, to survive a hot-reload race) + live updates.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < 6; i++) {
        try {
          const { profile, memories } = await window.cva.getProfile()
          if (!cancelled) {
            setProfile(profile)
            setMemories(memories)
          }
          return
        } catch {
          await new Promise((r) => setTimeout(r, 400))
        }
      }
    })()
    const offProfile = window.cva.onProfile((p) => setProfile(p))
    const offMemory = window.cva.onMemory(({ memories }) => setMemories(memories))
    return () => {
      cancelled = true
      offProfile()
      offMemory()
    }
  }, [setProfile, setMemories])

  return <HUD />
}
