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
| Speech-to-text (STT) | **Local Whisper** (transformers.js, `whisper-tiny.en`) — free, offline, no API key | Deepgram, OpenAI Whisper API, `whisper.cpp` |
| Brain | **Claude API** (`claude-opus-4-8` for quality / `claude-sonnet-4-6` for speed) | — |
| Text-to-speech (TTS) | **ElevenLabs** streaming | OpenAI TTS, system `say`, Cartesia |
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
- [x] **Local** STT — Whisper (`whisper-tiny.en`) via transformers.js, fully offline,
      no API key. Transcribes on release. (Chosen over paid Deepgram to keep it free.)
- [x] HUD "listening" state: orb glows amber and pulses with real mic amplitude.
- [ ] _Deferred:_ live interim transcripts + VAD auto-endpointing (Whisper is
      transcribe-on-release; live streaming + wake-word endpointing come in Phase 7).

**Deliverable:** Speak → release → transcript appears → text sent to Claude. ✅
**Verified:** whisper-tiny.en transcribes real speech correctly in a Node harness; app
builds + typechecks clean. (Live mic capture needs the GUI to exercise end-to-end.)

---

## Phase 3 — Voice Out (Speaking)  ·  ~Week 3

**Goal:** Claude answers *out loud* with a reacting visual.

- [ ] Integrate streaming TTS (ElevenLabs); play as audio arrives.
- [ ] Stream Claude's text → feed sentence chunks into TTS as they complete (don't wait
      for the full answer).
- [ ] HUD "speaking" state: orb/waveform reacts to output audio amplitude.
- [ ] Barge-in (stretch): if you start talking, stop playback and listen.
- [ ] Settings: voice selection, volume, speech rate.

**Deliverable:** Full voice loop — speak, it thinks, it speaks back, screen reflects each
state.
**Acceptance:** First audio out within ~1.5s of you finishing; states transition
cleanly listening → thinking → speaking → idle.

---

## Phase 4 — The Jarvis HUD  ·  ~Week 4

**Goal:** Make it *look* like Jarvis — a living dashboard, not a chat box.

- [ ] Central reactive orb (canvas/WebGL or Lottie/SVG) with distinct
      idle/listening/thinking/speaking animations.
- [ ] Widget grid: live clock + date, weather, today's calendar, recent transcript,
      system status (mic/connection).
- [ ] Captions: large, readable, animated transcript of what it's saying.
- [ ] Theme pass: glow, blur, subtle motion, sound cues for state changes.
- [ ] Responsive layout for the target display (define resolution: e.g. 1080p kiosk).

**Deliverable:** A screen you'd be happy to leave on a wall/desk.
**Acceptance:** Every assistant state is visually unambiguous at a glance from across the
room.

---

## Phase 5 — Claude Gets Hands (Tools)  ·  ~Weeks 5–6

**Goal:** Claude can *do* things, not just talk. Tool use + agentic loop.

- [ ] Implement Claude tool-use loop (define tools, handle `tool_use`, return results,
      continue).
- [ ] Starter tools:
  - [ ] `web_search` — answer current-events / factual questions.
  - [ ] `get_time` / `set_timer` / `set_alarm`.
  - [ ] `update_ui` — let Claude push widgets/cards to the HUD (e.g. "show me the
        weather" → renders a weather card).
  - [ ] `get_weather`.
- [ ] Integrations (pick what you use): Google Calendar (read agenda), Gmail (read/draft).
- [ ] Tool execution feedback in the HUD ("Searching the web…").

**Deliverable:** "What's on my calendar?" / "What's the weather Friday?" / "Set a 10
minute timer" all work end-to-end by voice.
**Acceptance:** Tools run reliably; failures degrade gracefully with a spoken apology,
not a crash.

---

## Phase 6 — Memory & Personality  ·  ~Week 7

**Goal:** It remembers, and it has a consistent character.

- [ ] System prompt defining the "Jarvis" persona (concise, dry wit, addresses you by
      name).
- [ ] Short-term memory: full conversation context with smart truncation/summarization.
- [ ] Long-term memory: persist facts/preferences to SQLite; recall relevant ones into
      context.
- [ ] Prompt caching to cut latency/cost on the stable system prompt + tools.
- [ ] User profile: name, location, units, preferred voice.

**Deliverable:** It greets you by name, remembers what you told it yesterday, stays in
character.
**Acceptance:** A fact stated in one session is recalled in the next.

---

## Phase 7 — Wake Word & Always-On  ·  ~Week 8

**Goal:** Drop the push-to-talk. Say "Hey Claude" from across the room.

- [ ] Integrate wake-word engine (Porcupine / openWakeWord).
- [ ] Always-listening loop: wake word → chime + listen → process → respond → back to
      idle.
- [ ] Endpointing tuning so it doesn't cut you off or hang waiting.
- [ ] Privacy: clear on-screen mic indicator; local-only wake detection (no audio
      leaves device until wake fires).

**Deliverable:** Hands-free operation. Walk up, say the word, have a conversation.
**Acceptance:** Wake word fires reliably with few false positives in normal room noise.

---

## Phase 8 — Polish, Reliability & Ship  ·  ~Week 9

**Goal:** Something that runs for days unattended without babysitting.

- [ ] Error handling everywhere: network drops, API timeouts, mic disconnects → spoken +
      visual recovery, auto-retry.
- [ ] Latency budget pass: measure each leg (STT/Claude/TTS), optimize the slowest.
- [ ] Cost guardrails: token usage logging, model routing (Sonnet for quick stuff, Opus
      for hard stuff).
- [ ] Auto-start on boot + kiosk/full-screen mode; crash auto-restart.
- [ ] Logging/telemetry for debugging conversations.
- [ ] Package/build for your target machine.

**Deliverable:** v1.0 — turn the machine on, it boots into Jarvis, just works.
**Acceptance:** 24h uptime test with no manual intervention.

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
