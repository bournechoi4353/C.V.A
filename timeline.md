# C.V.A — Claude Voice Assistant ("Jarvis") · Build Timeline

> A voice-first assistant with a always-on screen HUD. You speak, it listens, Claude
> thinks, it answers out loud, and the screen reflects state (listening / thinking /
> speaking) plus live widgets (transcript, time, weather, tasks).

---

## 0. North Star & Scope

**The experience we're building toward**
- A full-screen "HUD" that idles like a dashboard (clock, weather, status orb).
- Push-to-talk first, wake-word ("Hey Claude") later.
- Sub-2-second feel: you stop talking → it starts answering quickly.
- Claude can *do* things (tools): search the web, read calendar/email, set timers,
  control the UI, answer questions with memory of the conversation.
- Voice out that sounds natural, with a visible waveform/orb reacting to audio.

**Explicitly out of scope for v1** (revisit later): multi-user voice ID, offline-only
mode, mobile app, smart-home hardware control.

---

## Recommended Stack (defaults — swap freely)

| Layer | Default choice | Alternatives |
|---|---|---|
| App shell | **Electron + React + TypeScript** (full-screen kiosk-capable desktop app) | Tauri (lighter), Next.js web app, Raspberry Pi kiosk |
| Audio capture | Web Audio API / `MediaRecorder` | `node-record-lpcm16` (native) |
| Speech-to-text (STT) | **Local Distil-Whisper** `distil-small.en` (transformers.js) in a **system-Node sidecar** — free, offline, no key, native speed | Deepgram, OpenAI Whisper API, `whisper.cpp` |
| Brain | **Claude API** (`claude-opus-4-8` for quality / `claude-sonnet-4-6` for speed) | — |
| Text-to-speech (TTS) | **Kokoro** (kokoro-js, local neural, `af_heart` voice) — free, offline, no key | ElevenLabs, OpenAI TTS, system `say` |
| Wake word | **Picovoice Porcupine** | openWakeWord (local), push-to-talk only |
| State/store | Zustand | Redux, Jotai |
| Persistence | SQLite (better-sqlite3) | JSON file, Postgres |

> **Latency is the product.** Every phase below is graded partly on how fast the
> round-trip *feels*. Prefer streaming everything (STT → Claude → TTS) over waiting
> for complete responses.

---

## Phase 1 — Foundation & Skeleton  ·  ~Week 1

**Goal:** A window opens, shows the HUD shell, and you can talk to Claude in *text*.

- [ ] Scaffold Electron + React + TS, hot reload, ESLint/Prettier.
- [ ] Secure secrets: `.env` for API keys, never in renderer. Keep Claude calls in the
      main/Node process, expose via IPC.
- [ ] Basic HUD layout: full-screen dark canvas, central status zone, side panels
      (clock, placeholder widgets), bottom transcript strip.
- [ ] Wire the Claude API: a text input → Claude → text response on screen.
- [ ] Conversation state in Zustand; render message history.

**Deliverable:** Type a message, Claude answers in the HUD. No audio yet.
**Acceptance:** Round-trip text chat works; keys are not exposed to the renderer.

---

## Phase 2 — Voice In (Listening)  ·  DONE

**Goal:** Hold a key, speak, have your words transcribed and sent to Claude.

- [x] Mic permission + audio capture pipeline (Electron permission handler + getUserMedia).
- [x] Push-to-talk (hold the mic button **or** hold Spacebar): start/stop capture.
- [x] **Local** STT — fully offline, no API key, in a **system-Node sidecar process**.
      (Chosen over paid Deepgram to keep it free.) Model history: `whisper-tiny.en`
      (WASM) → `whisper-small.en` (native) → `distil-small.en` (~25–30% faster) →
      **`moonshine-base`** — built for short commands, compute scales with audio length
      (no 30s padding): **~0.05–0.1s per utterance, ~10× faster than distil** at equal
      accuracy on our bench phrases (`npm run bench:stt`). Push-to-talk captures raw
      16kHz PCM directly (no MediaRecorder encode→decode after release). Native STT
      can't run in Electron's own runtime (onnxruntime-node SIGTRAPs), so the worker is
      a separate process, which also crash-isolates it.
- [x] HUD "listening" state: orb glows amber and pulses with real mic amplitude.
- [ ] _Deferred:_ live interim transcripts + VAD auto-endpointing (Whisper is
      transcribe-on-release; live streaming + wake-word endpointing come in Phase 7).

**Deliverable:** Speak → release → transcript appears → text sent to Claude. ✅
**Verified:** whisper-tiny.en transcribes real speech correctly in a Node harness; app
builds + typechecks clean. (Live mic capture needs the GUI to exercise end-to-end.)

---

## Phase 3 — Voice Out (Speaking)  ·  DONE

**Goal:** Claude answers *out loud* with a reacting visual.

- [x] **Local** neural TTS — Kokoro (kokoro-js) in the main process via onnxruntime-node
      (native, verified under Electron's ABI). Free/offline. (Chosen over paid ElevenLabs.)
- [x] HUD "speaking" state: orb glows green and pulses to the **real** output amplitude
      (audio generated in main → played in renderer via Web Audio + AnalyserNode).
- [x] Barge-in: pressing the mic while CVA is speaking cuts off playback.
- [ ] _Deferred:_ sentence-chunk streaming TTS (needs streaming Claude output — our
      Claude call is non-streaming today; reply is short by design so we speak it whole).
- [ ] _Deferred:_ settings UI for voice/volume/rate (voice hardcoded to `af_heart`).

**Deliverable:** Full voice loop — speak → it thinks → it speaks back, orb reflects each
state (listening → thinking → speaking → idle). ✅
**Verified:** Kokoro generates audible speech (~4s clip, 1.6s) under the exact Electron
Node ABI; app builds + typechecks clean. (Live playback needs the GUI to exercise.)

---

## Phase 3.5 — Streaming Pipeline (Latency)  ·  DONE

**Goal:** Cut felt latency — start speaking the first sentence while Claude is still writing.

- [x] Stream Claude output via `includePartialMessages` → `stream_event` text deltas
      (handled in `cva.ts`; `ask(prompt, onDelta)`).
- [x] Chunk the stream into sentences as they complete (`pipeline.ts` `takeSentences` —
      decimal/abbreviation-safe char walker).
- [x] Per-sentence TTS: synth each sentence as it arrives, pipelined (Kokoro in main),
      emit `cva:turn-audio` per sentence.
- [x] Queued gapless playback (`ttsPlayback.ts`): sentences play back-to-back; orb stays
      "speaking" across the queue; live captions update from `cva:turn-text` deltas.
- [x] Barge-in: a mic press cancels the in-flight turn (main stops emitting via a cancel
      flag; renderer clears the queue) with a turn-generation guard so the dying turn
      can't clobber the new one's state.

**Deliverable:** First audio at ~time-to-first-sentence instead of full-reply + full-TTS. ✅
**Verified (Node, real Claude stream + native Kokoro):** for a 4-sentence reply, streaming
first-audio **≈4.9s** vs sequential **≈12.2s** (~7s sooner — synthesizing the whole
paragraph at once takes ~7s; streaming plays sentence 1 the moment it's ready). The gap
grows with reply length. Sentence splitter unit-tested (decimals, versions, `?!`, mid-stream).

---

## Phase 4 — The Jarvis HUD  ·  DONE

**Goal:** Make it *look* like Jarvis — a living dashboard, not a chat box.

- [x] Central reactive **canvas** orb (`StatusOrb.tsx`) — glowing core that grows with
      amplitude, reactive waveform ring, rotating arcs; palette shifts per state
      (idle cyan / listening amber / thinking pulse / speaking green). Fed by a shared
      `level.ts` (mic while listening, TTS while speaking).
- [x] Widget grid: live clock + date, system status (renderer/voice-in/voice-out with
      status dots), model card, Activity (current state + last input). Weather/agenda are
      styled placeholders → real data in Phase 5.
- [x] Captions: large, animated readout of CVA's current spoken line.
- [x] Theme pass: ambient grid background with state-reactive wash, glow, smooth motion.
      (Sound cues for state changes deferred.)
- [~] Responsive layout (min sizes set; full 1080p-kiosk tuning lands in Phase 8).

**Deliverable:** A screen you'd be happy to leave on a wall/desk. ✅
**Verified:** typecheck + build + lint clean. (Live visuals need the GUI to view.)
**Redesigned (post-Phase 7):** dropped the glowy sci-fi look for an **instrument-console
theme** — flat near-black, hairline borders, sharp corners (no border-radius anywhere),
monospace data labels, square status marks, one terracotta accent + functional state
hues (amber listening / green speaking); chat bubbles → console log rows; the orb is now
a reactive radial **tick-ring gauge** (per-tick smoothed energy, hairline circle, small
core, slow arcs) instead of a glowing blob. Verified by screenshotting the rendered app.

---

## Phase 5 — Claude Gets Hands (Tools)  ·  DONE

**Goal:** Claude can *do* things, not just talk. Tool use + agentic loop.

- [x] Tool-use loop — handled by the Agent SDK; custom tools via in-process MCP
      (`createSdkMcpServer` + `tool()`), auto-approved with `allowedTools` +
      `permissionMode: 'dontAsk'`. `strictMcpConfig: true` locks the session to ONLY our
      tools (excludes the account's claude.ai connectors, which otherwise hijack replies).
- [x] Starter tools ([tools.ts](src/main/tools.ts)):
  - [x] **WebSearch** — built-in; **works on subscription** (no API key). Current events/facts.
  - [x] `get_time` — current local date/time.
  - [x] `get_weather` — free **Open-Meteo** (geocode + current), no key; also fills the
        Weather widget. **Hardened:** the raw geocoder is name-prefix-only (zero results
        for "Washington DC"); [geocode.mjs](src/shared/geocode.mjs) now retries with
        progressively shorter queries and uses the dropped words as a state/country
        disambiguation hint ("dc" → District of Columbia, "Paris Texas" → Paris, TX).
        Tested live: `npm run test:geocode`.
  - [x] `set_timer` — countdown; on expiry CVA **speaks** an alert (Kokoro) + a HUD toast.
- [x] Tool-use feedback in the HUD — "Searching the web…" / "Checking the weather…" chip.
- [ ] _Deferred:_ generic `update_ui` cards; Gmail/Calendar (OAuth-heavy — note the
      subscription already exposes account connectors, but we lock them out for control).
- [x] Spoken-output hygiene: persona forbids URLs/citations + a TTS sanitizer strips links
      so audio never reads a URL.

**Deliverable:** "What's the weather in Tokyo?" / "Set a 10-minute timer" / "Who's the
president of France?" work end-to-end. ✅
**Verified (Node, real subscription):** custom tool handler executes, WebSearch returns
live results, `strictMcpConfig` yields concise replies ("It's 70 degrees and fair in Tokyo
right now."), Open-Meteo fetch + widget emit works, spoken text is URL-free. Tool errors
return `isError` → Claude apologizes rather than crashing.

---

## Phase 6 — Memory & Personality  ·  DONE

**Goal:** It remembers, and it has a consistent character.

- [x] Jarvis persona (concise, dry wit) + addresses you by name when known.
- [x] Short-term memory: the persistent Agent SDK session keeps full conversation context
      within a run (compaction handled by the SDK).
- [x] Long-term memory: facts/preferences persisted to a **JSON file**
      ([memory.ts](src/main/memory.ts)) in the app data dir — NOT SQLite (native modules
      keep crashing under Electron's ABI). `remember` / `forget` / `set_profile` tools let
      Claude save them; saved memories are loaded into the system prompt at session start.
- [x] Prompt caching: persona is the static, cacheable prefix; memory is the dynamic
      suffix, split with `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`.
- [x] User profile: name, location (used for weather), units — shown in a HUD **Profile**
      widget; a **Memory** widget lists what it's remembered; the header greets you by name.
- [ ] _Deferred:_ preferred-voice in profile (no clean NL → Kokoro-voice mapping yet).

**Deliverable:** It greets you by name, remembers what you told it, stays in character. ✅
**Verified (real subscription):** persistence round-trips across a simulated restart;
Claude calls `set_profile`+`remember` when you share details; with memory loaded it recalls
them ("You're Bourne, in Seattle. You take your coffee black."). Note: the subscription
account also contributes its own personalization (e.g. your email) on top of our store.

---

## Phase 7 — Wake Word & Always-On  ·  DONE

**Goal:** Drop the push-to-talk. Say **"Claude"** from across the room.
(Originally shipped as "Hey computah"; renamed.)

- [x] Wake detection — **no extra engine/key/native dep**: reuses the Whisper sidecar.
      An always-on energy-gated VAD ([wake.ts](src/renderer/src/wake.ts)) captures each
      utterance, transcribes it locally, and matches the name in a shared module
      ([wake-detect.mjs](src/shared/wake-detect.mjs)): known Whisper renderings (Claude /
      Claud / Clod / Clawed / Cloud / Klaud) + an edit-distance net, with leading fillers
      skipped ("Um, Claude…"). (Chosen over Porcupine, which needs an AccessKey + a
      native module that'd risk the same SIGTRAP crashes.)
- [x] Always-listening loop: utterance → wake match → chime → command runs → back to idle.
      Same-breath commands ("Claude, what's the weather?") run directly; a bare "Claude"
      arms an ~8s window for the next utterance.
- [x] **Follow-up listening:** when a reply ends in a question ("In what location?") the
      mic stays armed for ~12s — the next utterance is the answer, no re-wake needed, so
      clarifying exchanges flow like conversation. If you say "Claude, in Tokyo" out of
      habit, the name is stripped. The persona is told the mic stays open after questions
      so it asks exactly one short clarifying question when it needs information.
- [x] Endpointing: ~0.5s trailing-silence VAD with a min-speech gate + pre-roll so it
      doesn't clip the name. **Speculative transcription** fires at ~256ms of silence,
      so the transcript is ready the moment the endpoint confirms (discarded if the
      speaker resumes — speech-frame counts must match).
- [x] Privacy: a clear on-screen indicator ("● Listening for 'Claude'") + macOS's own
      mic indicator; wake detection is **fully local** — only the command is sent on.

**Deliverable:** Hands-free. Toggle it on, say "Claude, …", have a conversation. ✅
**Verified (real audio → distil-whisper):** "Claude, what is the weather in Tokyo?" →
wake fires, command extracted; "Hey Claude!", "Claude, set a timer for 10 minutes" all
fire; "It is cloudy outside today" / "What time is it right now?" stay quiet. 31 detector
unit tests pass (`npm run test:wake`). Build/typecheck/lint clean.
_Limitations:_ ~1.2–1.5s to act (0.5s silence-detect + ~0.7–0.9s transcribe); while CVA
is speaking, wake is ignored to avoid self-triggering on its own voice (no wake-barge-in
yet); follow-up answers are detected by the reply ending in "?" — statements that imply
a question won't re-arm the mic.

---

## Phase 8 — Polish, Reliability & Ship  ·  DONE (24h soak pending)

**Goal:** Something that runs for days unattended without babysitting.

- [x] Error handling everywhere: a **75s turn watchdog** (a hung CLI/network can't wedge
      the serialized turn chain — session resets, next turn respawns); **retry-once** for
      turns that die before any output reached the user; a **spoken + visual error
      fallback** ("Sorry — something went wrong…", never a silent hang); STT transcribe
      **retry after a worker crash** (worker already respawns); **wake-mic auto-reconnect**
      on device disconnect (5 attempts, then hands-free off with an error); weather/geocode
      fetch timeouts (8s).
- [~] Latency budget pass: every leg now logs `[timing] …` (stt / tts per sentence /
      per-turn first-token · first-audio · total). Optimizations landed: distil-whisper
      STT (~25–30% faster), raw-PCM push-to-talk (no post-release decode), first-clause
      TTS split (first audio doesn't wait for a long first sentence), Int16 audio IPC,
      pre-warmed playback AudioContext + no-gesture autoplay, geocode cache, 0.5s wake
      endpoint. **Session config trimmed** (`tools: ['WebSearch']` so the Claude Code
      toolset's schemas don't ship every turn; `thinking: disabled` — pure latency at
      1–3-sentence replies): benchmarked on real subscription (`npm run bench:turn`),
      session-start first-token ~2.8–4.9s → ~1.4–1.8s, warm turns equal or better.
      **Alexa-class round 2:** STT → moonshine-base (~10× faster, ~0.05–0.1s);
      speculative transcription during the silence window (STT effectively free);
      **local fast path** for time/timer/weather ([fastpath.ts](src/main/fastpath.ts) +
      [intents.mjs](src/shared/intents.mjs), `npm run test:intents`) — answers in ~1s
      with no Claude round-trip, conservative parser falls through to Claude; TTS LRU
      cache so repeated confirmations/alerts play instantly.
      Remaining: measure live round-trips in the GUI and attack the new slowest leg.
- [x] Cost guardrails: per-turn token usage + API-equivalent cost from the SDK result →
      `[usage]` log lines + a **Session widget** in the HUD (turns / tokens / cost).
      Model routing deliberately skipped: Haiku-everywhere is the latency choice, and
      usage draws from the subscription (no marginal cost), with the local fast path
      already handling the trivial intents for free.
- [x] Auto-start on boot (login item when packaged; `CVA_NO_AUTOSTART=1` to opt out) +
      fullscreen kiosk when packaged (`CVA_KIOSK=1` forces in dev, `CVA_WINDOWED=1`
      overrides); crash auto-restart: renderer crash/unresponsive → auto-reload,
      main-process crash → relaunch with a crash-loop guard (max 3 in 10 min).
- [x] Logging/telemetry: daily log files in the app data dir (7-day retention) capturing
      turns (user + reply text), per-leg timing, usage, errors, and crashes
      ([logger.ts](src/main/logger.ts)).
- [x] Package/build: `npm run package` → electron-builder → `dist/mac-arm64/CVA.app`
      (unsigned, asar off so the system-node STT sidecar + SDK CLI resolve real files;
      **speech models ship inside the app** — instant first run, no downloads).
      Debugged a packaged-only SIGSEGV: redirecting the model cache via the top-level
      transformers import loaded a second onnxruntime binding (1.24 napi-v6 alongside
      kokoro's nested 1.21 napi-v3) — two ORT versions in one process collide in
      `InferenceSessionWrap::LoadModel`. Fix: leave caches module-relative, one ORT per
      process. Also: Finder-launched apps get no shell PATH — augmented so `node` is
      findable for the sidecar.

**Deliverable:** v1.0 — turn the machine on, it boots into Jarvis, just works. ✅
**Verified (packaged .app, real conversation):** launched from `/` like Finder would —
TTS ready in 0.4s and STT in ~1s from shipped models, wake → greeting by name, fast-path
time in 0.94s, a live stock question via WebSearch, follow-up listening (clarifying
question → bare answer, no re-wake), usage + turn + timing all in the log file.
**Acceptance:** 24h uptime test with no manual intervention — **pending** (run it by
leaving the packaged app up for a day; the logs will tell the story).

---

## Backlog / v2 Ideas
- Vision: camera in, Claude sees the room / reads documents you hold up.
- Multi-modal output: charts, images, maps on the HUD.
- Smart-home control (Home Assistant tool).
- Multiple wake words / interruptible multi-turn ("actually, never mind").
- Voice identification (who's talking) for per-user memory.
- Mobile companion / remote trigger.
- Proactive mode: it speaks up (reminders, "your meeting starts in 5").

---

## Cross-Cutting Concerns (apply every phase)
- **Latency:** stream everything; measure the felt round-trip.
- **Secrets:** API keys live in the main process only, never the renderer/git.
- **Privacy:** explicit mic indicator; be deliberate about what audio is sent off-device.
- **Cost:** log tokens; cache the system prompt; route models by difficulty.
- **Graceful failure:** every error has a spoken + visual fallback. Never a silent hang.

---

## Suggested Milestones
1. **M1 — Text brain** (end Phase 1): chat with Claude in the HUD.
2. **M2 — Full voice loop** (end Phase 3): talk and be talked back to.
3. **M3 — It looks like Jarvis** (end Phase 4): demo-able HUD.
4. **M4 — It does things** (end Phase 5): tools + integrations live.
5. **M5 — Hands-free v1.0** (end Phase 8): wake word, always-on, ships.
