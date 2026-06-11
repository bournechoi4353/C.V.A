import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function TranscriptStrip() {
  const messages = useStore((s) => s.messages)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="transcript">
      {messages.length === 0 && (
        <div className="transcript__empty">SAY “CLAUDE” OR TYPE BELOW</div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`row row--${m.role}`}>
          <span className="row__role">{m.role === 'user' ? 'You' : 'Claude'}</span>
          <span className="row__text">{m.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
