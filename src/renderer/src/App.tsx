import { useEffect } from 'react'
import HUD from './components/HUD'
import { loadStt } from './stt'
import { useStore } from './store'

export default function App() {
  const setSttReady = useStore((s) => s.setSttReady)
  const setSttProgress = useStore((s) => s.setSttProgress)
  const setSttError = useStore((s) => s.setSttError)

  // Warm up the local Whisper model in the background on launch.
  useEffect(() => {
    loadStt((p) => setSttProgress(p))
      .then(() => setSttReady(true))
      .catch((err) => setSttError(err instanceof Error ? err.message : String(err)))
  }, [setSttReady, setSttProgress, setSttError])

  return <HUD />
}
