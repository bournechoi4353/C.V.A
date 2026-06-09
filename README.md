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

Speech-to-text runs **locally** with Whisper (`small.en`) via transformers.js — no API key,
no cloud, free. It runs natively in a small **sidecar Node process** (Whisper can't run in
Electron's own runtime without crashing), giving good accuracy at ~1.7s. On first launch it
downloads a ~250MB model (cached after; the System panel shows loading progress).

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

> First run downloads both speech models (~80MB Whisper + ~90MB Kokoro). One-time.

## Scripts

- `npm run dev` — launch in development (hot reload)
- `npm run build` — production build into `out/`
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
    tools.ts   custom tools (get_time / get_weather / set_timer) + WebSearch allow-list
    tts.ts     Kokoro text-to-speech (onnxruntime-node, native)
    stt.ts     spawns + drives the STT sidecar worker
    stt-worker.mjs  system-Node worker: Whisper small.en (native, crash-isolated)
  preload/     contextBridge: window.cva.askStream() / .transcribe() / onTurnAudio() / …
  renderer/    React HUD
    src/
      components/  HUD, StatusOrb (canvas orb), Captions, ClockWidget, SidePanel, TranscriptStrip, ChatInput, MicButton
      audio.ts        mic capture → mono 16kHz Float32 + live amplitude
      ttsPlayback.ts  gapless Web Audio queue + orb amplitude
      level.ts        shared audio level (mic + TTS) → canvas orb
      conversation.ts streaming turn + barge-in (turn-generation guard)
      store.ts        Zustand state (status, messages, STT/TTS load state)
      styles.css      Jarvis theme
```

## Notes

- Model is set in [src/main/cva.ts](src/main/cva.ts) (`MODEL`) — currently
  `claude-haiku-4-5` (fastest tier). Switch to `claude-sonnet-4-6` or `claude-opus-4-8`
  for more capability.
- Voice in/out is **Phase 2/3** — for now interaction is text.
