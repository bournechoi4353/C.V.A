// Time-to-first-token benchmark over the real Claude Agent SDK (subscription auth) —
// compares the app's OLD session config (full Claude Code built-in toolset, default
// thinking) against the NEW slim config (tools: ['WebSearch'], thinking disabled).
// Two turns per config: turn 1 includes session start (what app launch feels like),
// turn 2 is the warm steady state. Run: node scripts/bench-turn.mjs

import { query } from '@anthropic-ai/claude-agent-sdk'

delete process.env.ANTHROPIC_API_KEY // subscription auth, same as the app

const MODEL = 'claude-haiku-4-5'
const SYSTEM = `You are Claude — a voice assistant. Replies are spoken aloud: keep them to
one to three short sentences, no markdown.`

const PROMPTS = ['Say hello in one short sentence.', 'Name one color, in one short sentence.']

async function bench(label, extraOptions) {
  console.log(`\n=== ${label} ===`)
  // Pushable input stream so both turns share one session (same as the app).
  const queue = []
  let notify = null
  const input = {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          queue.length
            ? Promise.resolve({ value: queue.shift(), done: false })
            : new Promise((r) => (notify = r)),
      }
    },
  }
  const push = (text) => {
    const msg = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    }
    if (notify) {
      const n = notify
      notify = null
      n({ value: msg, done: false })
    } else queue.push(msg)
  }

  const q = query({
    prompt: input,
    options: {
      model: MODEL,
      systemPrompt: SYSTEM,
      permissionMode: 'dontAsk',
      settingSources: [],
      includePartialMessages: true,
      ...extraOptions,
    },
  })

  let turn = 0
  let t0 = Date.now()
  let tFirst = 0
  push(PROMPTS[turn])

  for await (const msg of q) {
    if (
      msg.type === 'stream_event' &&
      msg.event?.type === 'content_block_delta' &&
      msg.event.delta?.type === 'text_delta' &&
      !tFirst
    ) {
      tFirst = Date.now()
    }
    if (msg.type === 'result') {
      console.log(
        `  turn ${turn + 1}: first-token ${((tFirst - t0) / 1000).toFixed(2)}s · total ${((Date.now() - t0) / 1000).toFixed(2)}s`,
      )
      turn++
      if (turn >= PROMPTS.length) break
      t0 = Date.now()
      tFirst = 0
      push(PROMPTS[turn])
    }
  }
}

await bench('OLD config: full built-in toolset, default thinking', {
  allowedTools: ['WebSearch'],
})

await bench("NEW config: tools: ['WebSearch'] + thinking disabled", {
  allowedTools: ['WebSearch'],
  tools: ['WebSearch'],
  thinking: { type: 'disabled' },
})

process.exit(0)
