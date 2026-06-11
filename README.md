# C.V.A — Claude Voice Assistant

A Jarvis-style desktop assistant: a screen HUD you talk to. See [timeline.md](timeline.md)
for the full phased plan. **Phase 1 (this build):** Electron + React HUD shell with a
text round-trip to Claude.

## Auth — uses your Claude subscription, not an API key

This app talks to Claude through the **Claude Agent SDK**, which uses your logged-in
Claude Code session. Usage draws from your **Claude subscription** (Pro/Max), not a
billed `ANTHROPIC_API_KEY`.

Prerequisites:

1. Install the `claude` CLI and log in once:
   ```bash
   claude login
   ```
2. Make sure `ANTHROPIC_API_KEY` is **not** set in your environment (if it is, the SDK
   would use it and bill the API instead). The app also defensively unsets it at runtime.

## Run

```bash
npm install
npm run dev
```

A window opens with the HUD. Type in the box and press Enter, **or** talk to it:

## Voice in (Phase 2)

Speech-to-text runs **locally** with **Moonshine** (`moonshine-base`) via
transformers.js — no API key, no cloud, free. Moonshine is built for short voice
commands: compute scales with audio length instead of Whisper's fixed 30s padding, so a
2s utterance transcribes in **~0.05–0.1s** (benchmarked ~10× faster than
distil-whisper-small at equal accuracy on our phrases). It runs natively in a small
**sidecar Node process** (native ONNX can't run in Electron's own runtime without
crashing). On first launch it downloads a ~60MB model (cached after; the System panel
shows loading progress). Override the model with the `CVA_STT_MODEL` env var.

Push-to-talk captures raw 16kHz PCM directly (no encode/decode step), so transcription
starts the instant you release. In hands-free mode, transcription starts
**speculatively** at ~256ms of trailing silence — by the time the endpoint confirms
(~512ms), the transcript is already ready.

- **Hold the mic button** (or **hold the Spacebar** when not typing), speak, then release.
- The orb glows amber and pulses with your voice while listening.
- On release it transcribes locally, drops your words into the transcript, and sends them
  to Claude.
- macOS will prompt for **microphone permission** the first time — allow it.

## Voice out (Phase 3)

Claude speaks its replies aloud with **Kokoro**, a local neural TTS (free, offline, no
key) — voice `af_heart` (Kokoro's highest-graded, most natural voice). Generation runs in the main process via
onnxruntime-node (native, fast); the audio is played in the renderer via Web Audio so the
orb glows **green and pulses to Claude's actual voice**. First launch downloads a ~90MB
model (cached after; the System panel shows "Voice out · loading…").

- Ask anything (typed or spoken) → Claude replies in text **and** speaks it.
- **Barge-in:** press the mic while it's talking to cut it off and start a new turn.
- Voice is set in [src/main/tts.ts](src/main/tts.ts) (`VOICE`) — try `af_bella`, `am_fenrir`, `bm_george`, etc.

> First run downloads both speech models (~60MB Moonshine + ~90MB Kokoro). One-time.

## Hands-free (Phase 7)

Toggle **hands-free** in the HUD and just say **"Claude"** (or "Hey Claude") from across
the room — "Claude, what's the weather?" Detection is fully local (VAD + Whisper + fuzzy
matching, no extra engine or key); only the command after the name is sent on.

**Follow-up listening:** if Claude answers with a question ("In what location?"), the mic
stays armed — your next utterance is taken as the answer directly, no re-wake needed. A
"Listening…" toast shows while the mic is hot; it disarms after ~12s of silence. Saying
a bare "Claude" similarly arms an ~8s window for the command.

## Latency

The whole pipeline is streamed and instrumented. Each leg logs `[timing] …` lines in the
main-process console: STT (per transcription), TTS (per sentence), and per turn
(first-token / first-audio / total). To cut time-to-first-audio further, the pipeline
speaks the opening clause of the first sentence (split at a comma) while the rest is
still streaming, and audio crosses IPC as Int16 (half the copy). Wake endpointing fires
after ~0.5s of trailing silence.

The Claude session itself is trimmed for a voice loop: only **WebSearch** from the
built-in toolset is sent to the model (`tools: ['WebSearch']` — the full Claude Code
toolset's schemas otherwise ship every turn) and **extended thinking is disabled**
(replies are 1–3 spoken sentences; thinking only delays first audio). Benchmarked on a
real subscription session (`npm run bench:turn`): session-start first-token dropped from
~2.8–4.9s to ~1.4–1.8s, warm turns equal or better.

**Local fast path (the Alexa trick):** clear-cut commands — *what time is it*, *set a
timer for ten minutes*, *what's the weather (in X)* — are parsed and answered locally
([fastpath.ts](src/main/fastpath.ts) + [intents.mjs](src/shared/intents.mjs)), skipping
the Claude round trip entirely: speech-end → spoken answer in roughly a second. The
parser is conservative; anything ambiguous ("will it rain tomorrow?") goes to Claude as
usual. Repeated phrases also hit a small **TTS cache**, so confirmations and alerts play
instantly.

Tests/benchmarks:

- `npm run test:wake` — wake-phrase detector unit tests (shared module, exact code the
  renderer ships).
- `npm run test:intents` — fast-path intent parser (time/timer/weather vs
  must-go-to-Claude cases).
- `npm run test:geocode` — weather place-name resolver against the real Open-Meteo API
  ("Washington DC", "Paris Texas", "NYC", …).
- `npm run bench:stt` — synthesizes "Claude, …" phrases with Kokoro, then times STT
  models on them and checks the wake detector against real model output
  (`-- --models a,b` for arbitrary models).
- `npm run bench:turn` — times first-token over a real subscription session, old vs new
  session config.

## Ship it (Phase 8)

`npm run package` builds `dist/mac-arm64/CVA.app` (electron-builder, unsigned). The
packaged app is an appliance: **fullscreen**, **starts at login**, **ships the speech
models inside the bundle** (no first-run download), auto-reloads a crashed renderer, and
relaunches itself on a main-process crash (with a crash-loop guard). It needs a system
`node` on PATH for the STT sidecar and a logged-in `claude` CLI for the subscription.

Reliability: a 75s turn watchdog + one silent retry per failed turn + a spoken error
fallback; the STT worker respawns (and the lost utterance retries once); the wake mic
auto-reconnects if the input device disappears. Everything is logged to daily files in
`~/Library/Application Support/CVA/logs/` (7-day retention): turns, per-leg `[timing]`,
per-turn `[usage]` (also live in the HUD's Session widget), errors, crashes.

Env knobs: `CVA_WINDOWED=1` (no fullscreen), `CVA_NO_AUTOSTART=1` (no login item),
`CVA_KIOSK=1` (fullscreen in dev), `CVA_STT_MODEL` / `CVA_MODELS_DIR` (STT overrides).

## Scripts

- `npm run dev` — launch in development (hot reload)
- `npm run build` — production build into `out/`
- `npm run package` — build the distributable `.app` into `dist/`
- `npm start` — preview the production build
- `npm run typecheck` — TypeScript check
- `npm run lint` / `npm run format` — ESLint / Prettier

## Structure

```
src/
  main/        Electron main process
    index.ts   window + IPC handlers + mic permission
    cva.ts     Claude Agent SDK wrapper (subscription auth, persistent streaming session)
    pipeline.ts streaming turn: Claude deltas → sentence split → per-sentence Kokoro → audio
    tools.ts   custom tools (time / weather / timer / remember / set_profile) + WebSearch
    memory.ts  persistent long-term memory + user profile (JSON file)
    tts.ts     Kokoro text-to-speech (onnxruntime-node, native)
    stt.ts     spawns + drives the STT sidecar worker
    stt-worker.mjs  system-Node worker: distil-whisper (native, crash-isolated)
  shared/      wake-detect.mjs — wake-phrase matching (shared by renderer + test harness)
  preload/     contextBridge: window.cva.askStream() / .transcribe() / onTurnAudio() / …
  renderer/    React HUD
    src/
      components/  HUD, StatusOrb (canvas orb), Captions, SidePanel, ChatInput, MicButton, WakeToggle/WakeControl, Toast, ToolChip
      audio.ts        mic capture → mono 16kHz Float32 + live amplitude
      wake.ts         "Claude" wake word: VAD + local detection
      ttsPlayback.ts  gapless Web Audio queue + orb amplitude
      level.ts        shared audio level (mic + TTS) → canvas orb
      conversation.ts streaming turn + barge-in (turn-generation guard)
      store.ts        Zustand state (status, messages, STT/TTS load state)
      styles.css      instrument-console theme (flat, hairlines, mono labels, terracotta accent)
```

## Notes

- Model is set in [src/main/cva.ts](src/main/cva.ts) (`MODEL`) — currently
  `claude-haiku-4-5` (fastest tier). Switch to `claude-sonnet-4-6` or `claude-opus-4-8`
  for more capability.
- Voice in/out is **Phase 2/3** — for now interaction is text.
