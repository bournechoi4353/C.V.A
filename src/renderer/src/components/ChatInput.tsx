import { useState } from 'react'
import { useStore } from '../store'
import { sendUserText } from '../conversation'

export default function ChatInput() {
  const [value, setValue] = useState('')
  const status = useStore((s) => s.status)
  const busy = status === 'thinking'

  async function submit() {
    const text = value.trim()
    if (!text || busy) return
    setValue('')
    await sendUserText(text)
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
      />
      <button className="input__send" onClick={submit} disabled={busy || !value.trim()}>
        Send
      </button>
    </div>
  )
}
