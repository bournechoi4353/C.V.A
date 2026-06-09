import { useStore, type Status } from '../store'
import StatusOrb from './StatusOrb'
import Captions from './Captions'
import ClockWidget from './ClockWidget'
import SidePanel from './SidePanel'
import TranscriptStrip from './TranscriptStrip'
import ChatInput from './ChatInput'
import MicButton from './MicButton'
import ToolChip from './ToolChip'
import Toast from './Toast'

const STATE_LABELS: Record<Status, string> = {
  idle: 'Standing by',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

export default function HUD() {
  const status = useStore((s) => s.status)

  return (
    <div className={`hud hud--${status}`}>
      <div className="hud__bg" />
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
          <ToolChip />
          <Captions />
          <TranscriptStrip />
        </section>

        <SidePanel side="right" />
      </main>

      <footer className="hud__bottom">
        <MicButton />
        <ChatInput />
      </footer>

      <Toast />
    </div>
  )
}
