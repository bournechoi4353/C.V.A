import { useStore } from './store'
import { enqueueAudio, stopAudioQueue, audioQueueIdle } from './ttsPlayback'

// Each turn gets a monotonically increasing id. A new turn (or a barge-in) bumps it,
// which makes the previous turn's async callbacks no-ops — so a finishing turn can't
// clobber the status/messages of the one that interrupted it.
let activeTurn = 0

/** Barge-in: invalidate the current turn, stop audio, and tell main to stop emitting. */
export function cancelActiveTurn(): void {
  activeTurn++
  stopAudioQueue()
  useStore.getState().setToolActivity(null)
  window.cva.cancel().catch(() => {})
}

function toolLabel(name: string): string | null {
  if (name === 'WebSearch' || name === 'WebFetch') return 'Searching the web…'
  if (name === 'mcp__cva__get_weather') return 'Checking the weather…'
  if (name === 'mcp__cva__get_time') return 'Checking the time…'
  if (name === 'mcp__cva__set_timer') return 'Setting a timer…'
  return null // internal tools (e.g. tool search) — no UI noise
}

export async function sendUserText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const myTurn = ++activeTurn
  const isCurrent = () => activeTurn === myTurn
  const store = useStore.getState()

  store.addMessage({ id: crypto.randomUUID(), role: 'user', text: trimmed })
  const asstId = crypto.randomUUID()
  store.addMessage({ id: asstId, role: 'assistant', text: '' })
  store.setStatus('thinking')

  // Live captions: append streamed text deltas to the assistant message.
  const offText = window.cva.onTurnText(({ delta }) => {
    if (!isCurrent()) return
    useStore.getState().appendMessage(asstId, delta)
  })
  // Gapless playback: queue each synthesized sentence; flip to "speaking" on first audio.
  const offAudio = window.cva.onTurnAudio(({ samples, rate }) => {
    if (!isCurrent()) return
    if (useStore.getState().status !== 'speaking') useStore.getState().setStatus('speaking')
    useStore.getState().setToolActivity(null) // answer is coming — clear "Searching…"
    enqueueAudio(samples, rate)
  })
  // Tool-use feedback ("Searching the web…").
  const offTool = window.cva.onTurnTool(({ name }) => {
    if (!isCurrent()) return
    const label = toolLabel(name)
    if (label) useStore.getState().setToolActivity(label)
  })

  try {
    const res = await window.cva.askStream(trimmed)
    if (!isCurrent()) return
    if (res?.error) {
      useStore.getState().setMessageText(asstId, `⚠️ ${res.error}`)
    } else if (typeof res?.text === 'string') {
      useStore.getState().setMessageText(asstId, res.text) // finalize with the full text
    }
    await audioQueueIdle() // stay "speaking" until the queue drains
  } catch (err) {
    if (isCurrent()) {
      useStore
        .getState()
        .setMessageText(asstId, `⚠️ ${err instanceof Error ? err.message : String(err)}`)
    }
  } finally {
    offText()
    offAudio()
    offTool()
    if (isCurrent()) {
      useStore.getState().setStatus('idle')
      useStore.getState().setToolActivity(null)
    }
  }
}
