import { useStore, type Status } from '../store'

function Widget({ title, lines }: { title: string; lines: Array<{ text: string; dot?: string }> }) {
  return (
    <div className="widget">
      <div className="widget__title">{title}</div>
      <div className="widget__body">
        {lines.map((line, i) => (
          <div key={i} className="widget__line">
            {line.dot && <span className={`dot dot--${line.dot}`} />}
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}

const STATUS_TEXT: Record<Status, string> = {
  idle: 'Standing by',
  listening: 'Listening to you',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

export default function SidePanel({ side }: { side: 'left' | 'right' }) {
  const status = useStore((s) => s.status)
  const messages = useStore((s) => s.messages)
  const sttReady = useStore((s) => s.sttReady)
  const sttProgress = useStore((s) => s.sttProgress)
  const sttError = useStore((s) => s.sttError)
  const ttsReady = useStore((s) => s.ttsReady)
  const ttsError = useStore((s) => s.ttsError)

  const voiceIn = sttError
    ? { text: 'Voice in · error', dot: 'bad' }
    : sttReady
      ? { text: 'Voice in · ready', dot: 'ok' }
      : { text: `Voice in · ${Math.round(sttProgress)}%`, dot: 'wait' }
  const voiceOut = ttsError
    ? { text: 'Voice out · error', dot: 'bad' }
    : ttsReady
      ? { text: 'Voice out · ready', dot: 'ok' }
      : { text: 'Voice out · loading', dot: 'wait' }

  let lastUser = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUser = messages[i].text
      break
    }
  }

  if (side === 'left') {
    return (
      <aside className="panel panel--left">
        <Widget
          title="System"
          lines={[{ text: 'Renderer · online', dot: 'ok' }, voiceIn, voiceOut]}
        />
        <Widget
          title="Model"
          lines={[{ text: 'claude-haiku-4-5' }, { text: 'kokoro · af_heart' }]}
        />
      </aside>
    )
  }

  return (
    <aside className="panel panel--right">
      <Widget
        title="Activity"
        lines={[
          { text: STATUS_TEXT[status], dot: status === 'idle' ? 'wait' : 'ok' },
          { text: lastUser ? `Last: “${lastUser.slice(0, 40)}”` : 'No input yet' },
        ]}
      />
      <Widget title="Weather" lines={[{ text: '— phase 5 —' }]} />
      <Widget title="Agenda" lines={[{ text: '— phase 5 —' }]} />
    </aside>
  )
}
