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
import { createToolServer, ALLOWED_TOOLS } from './tools'
import { getMemoryContext } from './memory'
import { log } from './logger'

const MODEL = 'claude-haiku-4-5' // fastest tier — testing voice-loop latency

// A turn that never completes would wedge the serialized turn chain forever (the CLI
// subprocess can hang on a dead network). Past this, reset the session and surface an
// error — the next turn respawns fresh.
const TURN_TIMEOUT_MS = 75_000

export interface TurnUsage {
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
  durationMs: number
}
let usageListener: ((u: TurnUsage) => void) | null = null
/** Register a per-turn usage callback (token counts + cost from the SDK result). */
export function setUsageListener(fn: (u: TurnUsage) => void): void {
  usageListener = fn
}

// Session health → HUD. ok:true once the SDK session initializes (auth worked);
// ok:false when it dies before initializing (usually: `claude` CLI not logged in).
export interface ClaudeStatus {
  ok: boolean
  detail: string
}
let statusListener: ((s: ClaudeStatus) => void) | null = null
export function setClaudeStatusListener(fn: (s: ClaudeStatus) => void): void {
  statusListener = fn
}

const SYSTEM_PROMPT = `You are Claude — C.V.A. (Claude Voice Assistant), a Jarvis-style personal
assistant. The user addresses you by saying "Claude". Persona: composed, concise, dry wit.
You address the user directly and never waffle.
Because your replies are spoken aloud, keep them short and natural — usually one to three
sentences. Avoid markdown, bullet lists, code blocks, and emoji unless explicitly asked.
If you don't know something, say so plainly.
If you need information to complete a request (a location, a duration, a choice), ask ONE
short clarifying question and end your reply with it — the microphone stays open after a
question, so the user can answer directly.

You have tools: get the time, get the weather, set timers, search the web, remember facts
about the user, and update their profile (name, location, units). Use them silently when
they'd help — never list, name, or describe your tools, and don't narrate that you're using
one. When the user shares their name, location, units, or a lasting preference, quietly save
it (set_profile / remember) so you recall it next time. Address them by name when you know
it. Just answer.
Because you're speaking aloud, never include URLs, links, citations, or a "Sources:" list —
state the answer in plain spoken words.`

type AgentSdk = typeof import('@anthropic-ai/claude-agent-sdk')

let sdkPromise: Promise<AgentSdk> | null = null
function getSdk(): Promise<AgentSdk> {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk')
  return sdkPromise
}

// Don't let a stray API key silently bill the user — we want subscription auth.
function ensureSubscriptionAuth(): void {
  if (process.env.ANTHROPIC_API_KEY) {
    log('cva', 'ANTHROPIC_API_KEY is set — unsetting it so usage runs on your Claude subscription.')
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
let pendingOnDelta: ((text: string) => void) | null = null
let pendingOnTool: ((name: string) => void) | null = null
let chain: Promise<unknown> = Promise.resolve() // serialize turns (one in flight)

async function startSession(): Promise<void> {
  ensureSubscriptionAuth()
  const { query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } = await getSdk()
  input = new InputStream()
  accumulated = ''
  pendingResolve = null
  pendingReject = null

  const q = query({
    prompt: input,
    options: {
      model: MODEL,
      // Static persona (cacheable across sessions) → boundary → dynamic memory.
      systemPrompt: [SYSTEM_PROMPT, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, getMemoryContext()],
      mcpServers: { cva: createToolServer() }, // get_time / get_weather / set_timer
      allowedTools: ALLOWED_TOOLS, // our tools + built-in WebSearch
      // Latency: only WebSearch from the built-in toolset. Without this, every coding
      // tool's schema (Bash/Read/Edit/Glob/…) ships to the model each turn — slower
      // prefill on every session start and distraction for a voice assistant.
      tools: ['WebSearch'],
      // Latency: replies are 1–3 spoken sentences — extended thinking would delay
      // first-token (and so first-audio) for no quality gain at this reply length.
      thinking: { type: 'disabled' },
      permissionMode: 'dontAsk', // auto-allow the above, deny everything else (no prompts)
      strictMcpConfig: true, // ONLY our tools — ignore the account's claude.ai connectors
      settingSources: [], // don't load filesystem CLAUDE.md / settings into the persona
      includePartialMessages: true, // stream text deltas for the low-latency pipeline
    },
  })

  alive = true
  void consume(q)
}

// Drains the session's output stream. A `result` message marks end-of-turn.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function consume(q: AsyncIterable<any>): Promise<void> {
  let sawInit = false
  try {
    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        sawInit = true
        statusListener?.({ ok: true, detail: 'ready' })
      } else if (msg.type === 'stream_event') {
        // Incremental text deltas — drive the streaming TTS pipeline.
        const event = msg.event
        if (
          event?.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          event.delta.text
        ) {
          pendingOnDelta?.(event.delta.text)
        }
      } else if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) accumulated += block.text
          else if (block.type === 'tool_use' && block.name) pendingOnTool?.(block.name)
        }
      } else if (msg.type === 'result') {
        const u = msg.usage
        if (u) {
          try {
            usageListener?.({
              inputTokens: u.input_tokens ?? 0,
              outputTokens: u.output_tokens ?? 0,
              cacheRead: u.cache_read_input_tokens ?? 0,
              cacheWrite: u.cache_creation_input_tokens ?? 0,
              costUsd: msg.total_cost_usd ?? 0,
              durationMs: msg.duration_ms ?? 0,
            })
          } catch {
            /* usage reporting must never break a turn */
          }
        }
        const text =
          msg.subtype === 'success' && typeof msg.result === 'string' && msg.result
            ? msg.result
            : accumulated
        accumulated = ''
        const resolve = pendingResolve
        pendingResolve = null
        pendingReject = null
        pendingOnDelta = null
        pendingOnTool = null
        resolve?.(text.trim())
      }
    }
  } catch (err) {
    pendingReject?.(err)
    statusListener?.({ ok: false, detail: err instanceof Error ? err.message : String(err) })
  } finally {
    if (!sawInit) {
      statusListener?.({
        ok: false,
        detail: 'Claude session failed to start — open Terminal, run `claude`, and log in.',
      })
    }
    alive = false
    input = null
    pendingReject?.(new Error('Claude session ended'))
    pendingResolve = null
    pendingReject = null
    pendingOnDelta = null
    pendingOnTool = null
  }
}

export interface CvaReply {
  text: string
}

export async function ask(
  prompt: string,
  onDelta?: (text: string) => void,
  onTool?: (name: string) => void,
): Promise<CvaReply> {
  const run = async (): Promise<CvaReply> => {
    if (!alive) await startSession()
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const text = await new Promise<string>((resolve, reject) => {
      watchdog = setTimeout(() => {
        log('error', `turn watchdog fired after ${TURN_TIMEOUT_MS / 1000}s — resetting session`)
        resetConversation() // next turn respawns fresh
        reject(new Error('The assistant took too long to respond.'))
      }, TURN_TIMEOUT_MS)
      accumulated = ''
      pendingResolve = resolve
      pendingReject = reject
      pendingOnDelta = onDelta ?? null
      pendingOnTool = onTool ?? null
      input!.push({
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
      })
    }).finally(() => clearTimeout(watchdog))
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
