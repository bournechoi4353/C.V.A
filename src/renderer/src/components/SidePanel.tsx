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
  const profile = useStore((s) => s.profile)
  const memories = useStore((s) => s.memories)
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

  const profileLines = [
    { text: profile.name ? `Name · ${profile.name}` : 'Name · tell me your name' },
    ...(profile.location ? [{ text: `Location · ${profile.location}` }] : []),
    ...(profile.units ? [{ text: `Units · ${profile.units}` }] : []),
  ]

  const usage = useStore((s) => s.usage)
  const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
  const usageLines = usage.turns
    ? [
        { text: `Turns · ${usage.turns}` },
        { text: `Tokens · ${fmtTok(usage.inTokens)} in / ${fmtTok(usage.outTokens)} out` },
        ...(usage.costUsd > 0 ? [{ text: `API-equiv · $${usage.costUsd.toFixed(3)}` }] : []),
      ]
    : [{ text: 'No Claude turns yet' }]

  if (side === 'left') {
    return (
      <aside className="panel panel--left">
        <Widget
          title="System"
          lines={[{ text: 'Renderer · online', dot: 'ok' }, voiceIn, voiceOut]}
        />
        <Widget
          title="Models"
          lines={[
            { text: 'claude-haiku-4-5' },
            { text: 'moonshine-base' },
            { text: 'kokoro · af_heart' },
          ]}
        />
        <Widget title="Session" lines={usageLines} />
        <Widget title="Profile" lines={profileLines} />
      </aside>
    )
  }

  const weather = useStore((s) => s.weather)
  const weatherLines = weather
    ? [
        { text: weather.place },
        { text: `${weather.tempF}°F · ${weather.desc}` },
        { text: `feels ${weather.feelsF}° · wind ${weather.wind} mph` },
      ]
    : [{ text: 'Ask CVA about the weather' }]

  return (
    <aside className="panel panel--right">
      <Widget
        title="Activity"
        lines={[
          { text: STATUS_TEXT[status], dot: status === 'idle' ? 'wait' : 'ok' },
          { text: lastUser ? `Last: “${lastUser.slice(0, 40)}”` : 'No input yet' },
        ]}
      />
      <Widget title="Weather" lines={weatherLines} />
      <Widget
        title={`Memory · ${memories.length}`}
        lines={
          memories.length
            ? memories.slice(-3).map((m) => ({ text: `• ${m.text.slice(0, 38)}` }))
            : [{ text: 'Nothing remembered yet' }]
        }
      />
    </aside>
  )
}
