// Unit tests for the shared wake-phrase detector — the exact module the renderer ships.
// Cases come from real Whisper renderings of "Claude" / "Hey Claude". Run: npm run test:wake

import { detectWake, looksLikeNoise } from '../src/shared/wake-detect.mjs'

let failures = 0

function wake(text, expectCommand) {
  const r = detectWake(text)
  if (!r.woke) {
    console.error(`✗ MISS   ${JSON.stringify(text)} — expected wake`)
    failures++
  } else if (expectCommand !== undefined && r.command !== expectCommand) {
    console.error(`✗ CMD    ${JSON.stringify(text)} — got command ${JSON.stringify(r.command)}, want ${JSON.stringify(expectCommand)}`)
    failures++
  } else {
    console.log(`✓ wake   ${JSON.stringify(text)}${r.command ? ` → ${JSON.stringify(r.command)}` : ''}`)
  }
}

function noWake(text) {
  const r = detectWake(text)
  if (r.woke) {
    console.error(`✗ FALSE+ ${JSON.stringify(text)} — woke with command ${JSON.stringify(r.command)}`)
    failures++
  } else {
    console.log(`✓ quiet  ${JSON.stringify(text)}`)
  }
}

function noise(text, expected) {
  const got = looksLikeNoise(text)
  if (got !== expected) {
    console.error(`✗ NOISE  ${JSON.stringify(text)} — got ${got}, want ${expected}`)
    failures++
  } else {
    console.log(`✓ noise=${got} ${JSON.stringify(text)}`)
  }
}

// --- Whisper renderings that must wake ---
wake('Claude, what is the weather?', 'what is the weather')   // bare name — the primary form
wake('Claude.', '')
wake('Hey Claude.', '')
wake('Hey, Claude. What time is it?', 'what time is it')
wake("claude what's the weather", "what's the weather")
wake('Claud, set a timer.', 'set a timer')                    // dropped "e"
wake('Clod, turn on the lights.', 'turn on the lights')       // classic rendering
wake('Clawed, what day is it?', 'what day is it')             // classic rendering
wake('Cloud, set a timer for ten minutes.', 'set a timer for ten minutes')
wake('Hey Cloud, weather please.', 'weather please')
wake('Okay Claude. Lights.', 'lights')
wake('Um, Claude, what time is it?', 'what time is it')       // leading filler skipped
wake('Clause, what is two plus two?', 'what is two plus two') // fuzzy net (lev 1)
wake('So, anyway. Hey Claude, stop.', 'stop')                 // glued utterance, pass 2

// --- Normal speech that must NOT wake ---
noWake('What time is it?')
noWake('Set a timer for ten minutes.')
noWake('The weather is nice today.')
noWake('It is cloudy outside.')              // cloud-adjacent word mid-utterance
noWake('I asked Claude about it yesterday.') // name mid-utterance without greeting
noWake('The cloud storage is full.')         // "cloud" not at utterance start
noWake('He clapped loudly.')
noWake('Close the door.')                    // "close": lev 2 from claude — stays quiet
noWake('Santa Claus is coming.')             // "claus": lev 2 — stays quiet
noWake('Hey there, how are you?')

// --- Noise filter ---
noise('Thank you.', true)
noise('Thanks for watching!', true)
noise('[Music]', true)
noise('you', true)
noise('Hmm.', true)
noise("What's the weather like?", false)
noise('Turn on the lights', false)

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nAll wake-detection cases pass.')
