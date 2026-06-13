# C.V.A, the voice console for Claude

Say "Claude" and your Mac answers out loud. It listens for its name across the room,
thinks with Claude, and talks back in about a second. The speech never leaves your
machine; only the words of a command go to Claude, on your own subscription.

It feels like Alexa, but it can actually reason, search the web, and remember who you
are. The screen idles like a dashboard you'd leave on a wall.

## Install

On an Apple Silicon Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/bournechoi4353/C.V.A/main/scripts/install.sh | bash
```

That grabs the latest release (about 470MB, with the speech models and a Node runtime
inside, so there's nothing else to install), drops `CVA.app` in /Applications, and opens
it. Allow the microphone, flip on hands-free, and say "Claude."

You'll also need a Claude Pro or Max subscription with the `claude` CLI logged in:

```bash
npm i -g @anthropic-ai/claude-code
claude          # then /login
```

The System panel reads "Claude · needs login" until that's done. Your audio stays local
([here's why](PRIVACY.md)). Usage runs on your subscription, not a billed API key; if
`ANTHROPIC_API_KEY` is set the app unsets it so you're never charged the API rate.

## How it works

You talk, it hears you on-device, Claude thinks, it speaks back, and the orb pulses
along the whole way.

- **Hearing.** Speech-to-text is [Moonshine](https://github.com/usefulsensors/moonshine)
  running locally. It's built for short commands, so a couple seconds of speech becomes
  text in around a tenth of a second. Hold the mic button or the spacebar to talk, or go
  hands-free and let it listen for "Claude."
- **Thinking.** Claude (Haiku, for speed) over the Claude Agent SDK, with live web
  search and a memory of your name, location, and preferences that survives restarts.
- **Speaking.** [Kokoro](https://github.com/hexgrad/kokoro), a local neural voice. It
  starts talking as soon as Claude's first sentence lands instead of waiting for the
  whole reply.

Two tricks make it feel quick. Simple things, the time, a timer, the weather, are
answered right on the machine without bothering Claude at all, so you get a spoken answer
in roughly a second. And when Claude asks you something back ("which city?"), the mic
stays open so you just reply, no need to say "Claude" again.

## Develop

```bash
npm install
npm run dev      # HUD with hot reload
```

Other scripts:

- `npm run build` builds into `out/`
- `npm run package` / `npm run package:dmg` build the app and DMG into `dist/`
- `npm run typecheck`, `npm run lint`, `npm run format`
- `npm run test:wake`, `test:intents`, `test:geocode` are the unit tests
- `npm run bench:stt`, `bench:turn` measure the speech and round-trip latency

A packaged build runs as an appliance: fullscreen, starts at login, ships the models in
the bundle, and picks itself back up after a crash. It also keeps daily logs in
`~/Library/Application Support/CVA/logs/`. Handy env flags: `CVA_WINDOWED=1`,
`CVA_NO_AUTOSTART=1`, `CVA_KIOSK=1`, `CVA_STT_MODEL`, `CVA_MODELS_DIR`.

## Layout

```
src/
  main/        Electron main process
    cva.ts        Claude Agent SDK wrapper (persistent streaming session)
    pipeline.ts   streams Claude, splits into sentences, voices each one
    fastpath.ts   local time/timer/weather answers, no Claude round trip
    tools.ts      time / weather / timer / remember / set_profile + WebSearch
    tts.ts        Kokoro voice
    stt.ts        drives the speech-to-text sidecar
    stt-worker.mjs  Moonshine, in its own process so native ONNX can't crash the app
    memory.ts     profile + remembered facts (JSON file)
    logger.ts     daily logs
  shared/      wake-detect, intents, geocode (plain JS, shared with the tests)
  preload/     the window.cva bridge
  renderer/    the React HUD (orb, captions, panels, mic + wake controls)
```

## Notes

- The model lives in [src/main/cva.ts](src/main/cva.ts). Haiku is the fast default;
  swap in Sonnet or Opus for more depth.
- The voice lives in [src/main/tts.ts](src/main/tts.ts). `af_heart` is the default;
  Kokoro ships plenty of others.
- [PRODUCT.md](PRODUCT.md) has the positioning and launch checklist;
  [timeline.md](timeline.md) has the full build history.
