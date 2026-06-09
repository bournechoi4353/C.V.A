// Wrapper around the Claude Agent SDK.
//
// Auth: this uses NO API key. The SDK falls back to your logged-in Claude Code
// session (`claude login`) so usage draws from your Claude subscription, not a
// billed ANTHROPIC_API_KEY. If ANTHROPIC_API_KEY is set in the environment it
// would override that — see ensureSubscriptionAuth() below.
//
// Latency: instead of calling query() per turn (which re-spawns the `claude`
// subprocess each time, ~1s of overhead), we keep ONE streaming-input session
// alive and push each user turn into it. Warm turns skip the respawn and benefit
// from prompt caching.

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

const MODEL = 'claude-haiku-4-5' // fastest tier — testing voice-loop latency

const SYSTEM_PROMPT = `You are C.V.A. (Claude Voice Assistant) — a Jarvis-style personal assistant.
Persona: composed, concise, dry wit. You address the user directly and never waffle.
Because your replies are spoken aloud, keep them short and natural — usually one to three
sentences. Avoid markdown, bullet lists, code blocks, and emoji unless explicitly asked.
If you don't know something, say so plainly.`

type AgentSdk = typeof import('@anthropic-ai/claude-agent-sdk')

let sdkPromise: Promise<AgentSdk> | null = null
function getSdk(): Promise<AgentSdk> {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk')
  return sdkPromise
}

// Don't let a stray API key silently bill the user — we want subscription auth.
function ensureSubscriptionAuth(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn('[cva] ANTHROPIC_API_KEY is set — unsetting it so usage runs on your Claude subscription.')
    delete process.env.ANTHROPIC_API_KEY
  }
}

// A pushable async-iterable: feeds user turns into the long-lived session.
class InputStream {
  private queue: SDKUserMessage[] = []
  private waiters: Array<(r: IteratorResult<SDKUserMessage>) => void> = []
  private closed = false

  push(msg: SDKUserMessage): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: msg, done: false })
    else this.queue.push(msg)
  }

  close(): void {
    this.closed = true
    let waiter
    while ((waiter = this.waiters.shift())) {
      waiter({ value: undefined as unknown as SDKUserMessage, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const item = this.queue.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true })
        }
        return new Promise((resolve) => this.waiters.push(resolve))
      },
    }
  }
}

// ---- Persistent session state ----
let input: InputStream | null = null
let alive = false
let accumulated = ''
let pendingResolve: ((text: string) => void) | null = null
let pendingReject: ((err: unknown) => void) | null = null
let chain: Promise<unknown> = Promise.resolve() // serialize turns (one in flight)

async function startSession(): Promise<void> {
  ensureSubscriptionAuth()
  const { query } = await getSdk()
  input = new InputStream()
  accumulated = ''
  pendingResolve = null
  pendingReject = null

  const q = query({
    prompt: input,
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [], // plain conversation — tools land in Phase 5
      settingSources: [], // don't load filesystem CLAUDE.md / settings into the persona
    },
  })

  alive = true
  void consume(q)
}

// Drains the session's output stream. A `result` message marks end-of-turn.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function consume(q: AsyncIterable<any>): Promise<void> {
  try {
    for await (const msg of q) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) accumulated += block.text
        }
      } else if (msg.type === 'result') {
        const text =
          msg.subtype === 'success' && typeof msg.result === 'string' && msg.result
            ? msg.result
            : accumulated
        accumulated = ''
        const resolve = pendingResolve
        pendingResolve = null
        pendingReject = null
        resolve?.(text.trim())
      }
    }
  } catch (err) {
    pendingReject?.(err)
  } finally {
    alive = false
    input = null
    pendingReject?.(new Error('Claude session ended'))
    pendingResolve = null
    pendingReject = null
  }
}

export interface CvaReply {
  text: string
}

export async function ask(prompt: string): Promise<CvaReply> {
  const run = async (): Promise<CvaReply> => {
    if (!alive) await startSession()
    const text = await new Promise<string>((resolve, reject) => {
      accumulated = ''
      pendingResolve = resolve
      pendingReject = reject
      input!.push({
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
      })
    })
    return { text }
  }

  // Serialize turns so only one is in flight at a time (single pending slot).
  const result = chain.then(run, run)
  chain = result.then(
    () => {},
    () => {},
  )
  return result
}

/** Pre-spawn the session at startup so the first real turn isn't cold. */
export async function warm(): Promise<void> {
  if (!alive) await startSession()
}

export function resetConversation(): void {
  input?.close()
  input = null
  alive = false
  accumulated = ''
  pendingResolve = null
  pendingReject = null
}
