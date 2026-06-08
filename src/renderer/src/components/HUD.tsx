import { useStore, type Status } from '../store'
import StatusOrb from './StatusOrb'
import ClockWidget from './ClockWidget'
import SidePanel from './SidePanel'
import TranscriptStrip from './TranscriptStrip'
import ChatInput from './ChatInput'

const STATE_LABELS: Record<Status, string> = {
  idle: 'Standing by',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

export default function HUD() {
  const status = useStore((s) => s.status)

  return (
    <div className="hud">
      <header className="hud__top">
        <div className="hud__brand">
          C.V.A<span> / Claude Voice Assistant</span>
        </div>
        <ClockWidget />
      </header>

      <main className="hud__body">
        <SidePanel side="left" />

        <section className="hud__stage">
          <StatusOrb />
          <div className={`hud__state hud__state--${status}`}>{STATE_LABELS[status]}</div>
          <TranscriptStrip />
        </section>

        <SidePanel side="right" />
      </main>

      <footer className="hud__bottom">
        <ChatInput />
      </footer>
    </div>
  )
}
