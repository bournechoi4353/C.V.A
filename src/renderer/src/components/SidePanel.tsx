import { useStore } from '../store'

function Widget({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="widget">
      <div className="widget__title">{title}</div>
      <div className="widget__body">
        {lines.map((line, i) => (
          <div key={i} className="widget__line">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

// Placeholder widgets — real data (weather, calendar) arrives in later phases.
export default function SidePanel({ side }: { side: 'left' | 'right' }) {
  const sttReady = useStore((s) => s.sttReady)
  const sttProgress = useStore((s) => s.sttProgress)
  const sttError = useStore((s) => s.sttError)

  const ttsReady = useStore((s) => s.ttsReady)
  const ttsError = useStore((s) => s.ttsError)

  const voiceInLine = sttError
    ? 'Voice in · error'
    : sttReady
      ? 'Voice in · ready'
      : `Voice in · loading ${Math.round(sttProgress)}%`
  const voiceOutLine = ttsError ? 'Voice out · error' : ttsReady ? 'Voice out · ready' : 'Voice out · loading…'

  return (
    <aside className={`panel panel--${side}`}>
      {side === 'left' ? (
        <>
          <Widget title="System" lines={['Renderer · online', voiceInLine, voiceOutLine]} />
          <Widget title="Model" lines={['claude-sonnet-4-6', 'kokoro · bm_george']} />
        </>
      ) : (
        <>
          <Widget title="Weather" lines={['— phase 5 —']} />
          <Widget title="Agenda" lines={['— phase 5 —']} />
        </>
      )}
    </aside>
  )
}
