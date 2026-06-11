// Unit tests for the fast-path intent parser — the exact module the main process ships.
// Run: npm run test:intents

import { parseIntent, parseDuration } from '../src/shared/intents.mjs'

let failures = 0

function eq(got, want, label) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    console.log(`✓ ${label} → ${g}`)
  } else {
    failures++
    console.error(`✗ ${label} → ${g} (want ${w})`)
  }
}

// --- time ---
eq(parseIntent('What time is it?'), { type: 'time' }, 'time q')
eq(parseIntent("what's the time"), { type: 'time' }, 'time casual')
eq(parseIntent('What is the time right now?'), { type: 'time' }, 'time now')
eq(parseIntent('What time is it in London?'), null, 'timezone → Claude')
eq(parseIntent('How much time do I have left?'), null, 'not a time ask')

// --- timer ---
eq(parseIntent('Set a timer for ten minutes'), { type: 'timer', seconds: 600, label: null }, 'timer words')
eq(parseIntent('set a timer for 5 minutes'), { type: 'timer', seconds: 300, label: null }, 'timer digits')
eq(parseIntent('Set a 10 minute timer.'), { type: 'timer', seconds: 600, label: null }, 'timer prefix form')
eq(parseIntent('start a timer for an hour'), { type: 'timer', seconds: 3600, label: null }, 'timer an hour')
eq(parseIntent('set a timer for half an hour'), { type: 'timer', seconds: 1800, label: null }, 'timer half hour')
eq(parseIntent('set a timer for 90 seconds'), { type: 'timer', seconds: 90, label: null }, 'timer seconds')
eq(
  parseIntent('set a timer for 8 minutes for the pasta'),
  { type: 'timer', seconds: 480, label: 'pasta' },
  'timer label',
)
eq(parseIntent('set a timer'), null, 'timer no duration → Claude')
eq(parseIntent('cancel the timer'), null, 'timer cancel → Claude')

// --- weather ---
eq(parseIntent("What's the weather?"), { type: 'weather', location: '' }, 'weather bare')
eq(parseIntent('what is the weather like today'), { type: 'weather', location: '' }, 'weather today')
eq(
  parseIntent("What's the weather in Washington DC?"),
  { type: 'weather', location: 'washington dc' },
  'weather DC',
)
eq(
  parseIntent('what is the temperature in tokyo right now'),
  { type: 'weather', location: 'tokyo' },
  'weather temp + now',
)
eq(parseIntent('How hot is it outside?'), { type: 'weather', location: '' }, 'weather hot')
eq(parseIntent('Will it rain tomorrow?'), null, 'forecast tomorrow → Claude')
eq(parseIntent("what's the weather this weekend"), null, 'forecast weekend → Claude')

// --- must go to Claude ---
eq(parseIntent('Who is the president of France?'), null, 'general q')
eq(parseIntent('Remember that I like black coffee'), null, 'memory')
eq(parseIntent('Tell me a joke'), null, 'chitchat')

// --- duration parsing ---
eq(parseDuration('twenty minutes'), 1200, 'dur twenty min')
eq(parseDuration('1.5 hours'), 5400, 'dur fractional')
eq(parseDuration('a minute'), 60, 'dur a minute')
eq(parseDuration('soon'), null, 'dur unparseable')

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll intent cases pass.')
