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
        <div className="transcript__empty">Type below to talk to CVA…</div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`bubble bubble--${m.role}`}>
          <span className="bubble__role">{m.role === 'user' ? 'You' : 'CVA'}</span>
          <span className="bubble__text">{m.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
