import { useStore } from '../store'

// Large, readable caption of CVA's current spoken line — the "from across the room"
// readout. Shows the latest assistant message while speaking/thinking; fades otherwise.
export default function Captions() {
  const messages = useStore((s) => s.messages)
  const status = useStore((s) => s.status)

  let lastAssistant = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = messages[i].text
      break
    }
  }

  const show = (status === 'speaking' || status === 'thinking') && lastAssistant.length > 0

  return (
    <div className={`captions ${show ? 'captions--on' : ''}`}>
      <span>{lastAssistant}</span>
    </div>
  )
}
