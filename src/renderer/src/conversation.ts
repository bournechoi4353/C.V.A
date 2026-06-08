import { useStore } from './store'

// Shared "send text to Claude" turn, used by both the keyboard input and voice input.
export async function sendUserText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const { addMessage, setStatus } = useStore.getState()
  addMessage({ id: crypto.randomUUID(), role: 'user', text: trimmed })
  setStatus('thinking')

  try {
    const reply = await window.cva.send(trimmed)
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      text: reply.error ? `⚠️ ${reply.error}` : reply.text || '(no response)',
    })
  } catch (err) {
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      text: `⚠️ ${err instanceof Error ? err.message : String(err)}`,
    })
  } finally {
    setStatus('idle')
  }
}
