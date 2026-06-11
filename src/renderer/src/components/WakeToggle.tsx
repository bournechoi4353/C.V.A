import { useStore } from '../store'

// Toggles hands-free wake-word listening. The label doubles as the privacy indicator —
// it's obvious when the mic is always-on. When on, shows the last thing it heard so you
// can tell whether a miss was the mic/VAD or the wake-phrase matching.
export default function WakeToggle() {
  const wakeMode = useStore((s) => s.wakeMode)
  const wakeHeard = useStore((s) => s.wakeHeard)
  const sttReady = useStore((s) => s.sttReady)
  const setWakeMode = useStore((s) => s.setWakeMode)

  return (
    <div className="wake-wrap">
      <button
        className={`wake ${wakeMode ? 'wake--on' : ''}`}
        disabled={!sttReady}
        onClick={() => setWakeMode(!wakeMode)}
        title={'Respond to “Claude” hands-free'}
      >
        {wakeMode ? '● Listening for “Claude”' : '○ Hands-free off'}
      </button>
      {wakeMode && wakeHeard && (
        <div className="wake-heard">heard: “{wakeHeard.slice(0, 48)}”</div>
      )}
    </div>
  )
}
