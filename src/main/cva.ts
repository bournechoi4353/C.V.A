// Wrapper around the Claude Agent SDK.
//
// Auth: this uses NO API key. The SDK falls back to your logged-in Claude Code
// session (`claude login`) so usage draws from your Claude subscription, not a
// billed ANTHROPIC_API_KEY. If ANTHROPIC_API_KEY is set in the environment it
// would override that — see ensureSubscriptionAuth() below.
//
// The SDK is ESM-only; we load it via dynamic import() so it works from this
// CommonJS main-process bundle.

const MODEL = 'claude-opus-4-8' // most capable; swap to 'claude-sonnet-4-6' for lower latency

const SYSTEM_PROMPT = `You are C.V.A. (Claude Voice Assistant) — a Jarvis-style personal assistant.
Persona: composed, concise, dry wit. You address the user directly and never waffle.
Because your replies are spoken aloud, keep them short and natural — usually one to three
sentences. Avoid markdown, bullet lists, code blocks, and emoji unless explicitly asked.
If you don't know something, say so plainly.`

type AgentSdk = typeof import('@anthropic-ai/claude-agent-sdk')

let sdkPromise: Promise<AgentSdk> | null = null
function getSdk(): Promise<AgentSdk> {
  if (!sdkPromise) {
    sdkPromise = import('@anthropic-ai/claude-agent-sdk')
  }
  return sdkPromise
}

// Don't let a stray API key silently bill the user — we want subscription auth.
function ensureSubscriptionAuth(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn('[cva] ANTHROPIC_API_KEY is set — unsetting it so usage runs on your Claude subscription.')
    delete process.env.ANTHROPIC_API_KEY
  }
}

// One running conversation; resume by session id so context carries across turns.
let currentSessionId: string | undefined

export interface CvaReply {
  text: string
  sessionId?: string
}

export async function ask(prompt: string): Promise<CvaReply> {
  ensureSubscriptionAuth()
  const { query } = await getSdk()

  let text = ''

  const response = query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [], // plain conversation for now — tools land in Phase 5
      settingSources: [], // don't load filesystem CLAUDE.md / settings into the persona
      ...(currentSessionId ? { resume: currentSessionId } : {}),
    },
  })

  // The SDK yields a stream of messages. We capture the session id and accumulate
  // assistant text. Typed loosely on purpose — the message union shape is large.
  for await (const message of response) {
    const m = message as {
      type: string
      subtype?: string
      session_id?: string
      result?: string
      message?: { content?: Array<{ type: string; text?: string }> }
    }

    if (m.session_id) currentSessionId = m.session_id

    if (m.type === 'assistant' && m.message?.content) {
      for (const block of m.message.content) {
        if (block.type === 'text' && block.text) text += block.text
      }
    } else if (m.type === 'result' && !text && typeof m.result === 'string') {
      // Fallback: the final result message carries the full answer.
      text = m.result
    }
  }

  return { text: text.trim(), sessionId: currentSessionId }
}

export function resetConversation(): void {
  currentSessionId = undefined
}
