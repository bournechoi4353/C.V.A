import { useStore } from './store'
import { playAudio } from './ttsPlayback'

// Speak text via Kokoro (generated in main, played in the renderer for orb sync).
async function speak(text: string): Promise<void> {
  try {
    const res = await window.cva.speak(text)
    if (res.error || !res.samples || !res.rate || res.samples.length === 0) return
    useStore.getState().setStatus('speaking')
    await playAudio(res.samples, res.rate)
  } catch {
    /* speaking is best-effort; the text reply is already shown */
  }
}

// Shared "send text to Claude" turn, used by both the keyboard input and voice input.
export async function sendUserText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const { addMessage, setStatus } = useStore.getState()
  addMessage({ id: crypto.randomUUID(), role: 'user', text: trimmed })
  setStatus('thinking')

  try {
    const reply = await window.cva.send(trimmed)
    const replyText = reply.error ? `⚠️ ${reply.error}` : reply.text || '(no response)'
    addMessage({ id: crypto.randomUUID(), role: 'assistant', text: replyText })
    if (!reply.error && reply.text) {
      await speak(reply.text) // sets status to 'speaking' while audio plays
    }
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
