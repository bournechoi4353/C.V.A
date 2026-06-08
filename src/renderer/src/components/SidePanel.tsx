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

// Placeholder widgets — real data (weather, calendar, system) arrives in later phases.
export default function SidePanel({ side }: { side: 'left' | 'right' }) {
  return (
    <aside className={`panel panel--${side}`}>
      {side === 'left' ? (
        <>
          <Widget title="System" lines={['Renderer · online', 'Bridge · ready', 'Voice · phase 2']} />
          <Widget title="Model" lines={['claude-opus-4-8', 'subscription auth']} />
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
