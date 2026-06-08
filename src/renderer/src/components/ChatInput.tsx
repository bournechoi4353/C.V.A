import { useState } from 'react'
import { useStore } from '../store'

export default function ChatInput() {
  const [value, setValue] = useState('')
  const status = useStore((s) => s.status)
  const addMessage = useStore((s) => s.addMessage)
  const setStatus = useStore((s) => s.setStatus)
  const busy = status === 'thinking'

  async function submit() {
    const text = value.trim()
    if (!text || busy) return

    setValue('')
    addMessage({ id: crypto.randomUUID(), role: 'user', text })
    setStatus('thinking')

    const reply = await window.cva.send(text)

    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      text: reply.error ? `⚠️ ${reply.error}` : reply.text || '(no response)',
    })
    setStatus('idle')
  }

  return (
    <div className="input">
      <input
        className="input__field"
        placeholder={busy ? 'CVA is thinking…' : 'Type to talk to CVA…'}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        autoFocus
      />
      <button className="input__send" onClick={submit} disabled={busy || !value.trim()}>
        Send
      </button>
    </div>
  )
}
