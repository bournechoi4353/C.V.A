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

  const voiceLine = sttError
    ? 'Voice · error'
    : sttReady
      ? 'Voice · ready'
      : `Voice · loading ${Math.round(sttProgress)}%`

  return (
    <aside className={`panel panel--${side}`}>
      {side === 'left' ? (
        <>
          <Widget title="System" lines={['Renderer · online', 'Bridge · ready', voiceLine]} />
          <Widget title="Model" lines={['claude-sonnet-4-6', 'subscription auth']} />
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
