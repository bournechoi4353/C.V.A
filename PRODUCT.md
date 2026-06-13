# C.V.A — Product

> The product identity, positioning, and launch plan. Engineering details live in
> [README.md](README.md); build history in [timeline.md](timeline.md).

---

## Name

**C.V.A** (styled with the dots, spoken "see-vee-ay"). Descriptor: *the voice console
for Claude*.

The name stays — it's distinctive, J.A.R.V.I.S.-coded, and already lives in the app,
bundle, and wake flow. Note on trademarks: "Claude" is Anthropic's mark. Always use
nominative phrasing — "**for** Claude", "**powered by** Claude", "works **with** your
Claude subscription" — never "Claude Console" or similar as the product name. If
distance is ever needed, shortlisted alternates: **Vox**, **Atrium**, **Adjutant**.

## One-liner

> **C.V.A turns a Mac into a Jarvis-style voice console for Claude — always listening
> for its name, answering out loud in about a second, with every word of audio
> processed on-device.**

Store-length variant (under 30 words):

> A Jarvis-style voice assistant for your Mac, powered by Claude. Local ears, local
> voice, frontier brain — say "Claude" and it answers.

## Taglines

- Hero: **Say "Claude."**
- Privacy: **Local ears. Local voice. Claude brain.**
- Speed: **Alexa-fast. Claude-smart.**
- Appliance: **A computer you talk to.**

## Elevator pitch (30 seconds)

Voice assistants made you choose: fast-but-dumb (Alexa, Siri) or smart-but-clunky
(open an app, hold a button, wait). C.V.A is both. It's a Mac app that idles as a
wall-worthy instrument console; say "Claude" from across the room and it answers out
loud — common things like time, timers, and weather in about a second without touching
the network brain at all, and everything else through Claude with live web search and
a memory of who you are. The microphone pipeline is entirely on-device: your audio
never leaves the machine, only the final text of a command goes to Claude. It runs on
the Claude subscription you already pay for. Turn the Mac on, it boots straight into
the console, and it just works.

## Positioning

**For** Claude Pro/Max subscribers with a Mac (a desk Mac, a spare Mac mini, a
wall-mounted display) **who** want an always-on home/desk assistant that's actually
intelligent, **C.V.A** is a voice-console appliance **that** pairs frontier-model
answers with sub-second local responses and on-device audio. **Unlike** Alexa, Siri,
and Google Home, it can genuinely reason, search, and remember — and it never streams
your room's audio to a cloud. **Unlike** ChatGPT/Claude voice modes on a phone, it's
hands-free, always-on, wake-word driven, and built to be left running for days.

## Product pillars (feature copy)

1. **Say the word.** Hands-free wake on "Claude" — detection is fully local (VAD +
   on-device transcription + fuzzy matching). If it asks you a clarifying question,
   the mic stays open: answer like a person, no re-wake.
2. **Fast where it counts.** Time, timers, and weather are answered by a local fast
   path in ~1 second. Everything else streams from Claude, speaking the first sentence
   while the rest is still being written.
3. **A real brain.** Claude with live web search, current weather anywhere, and
   persistent memory — it greets you by name, knows your city and units, and remembers
   what you tell it across restarts.
4. **Private by architecture.** Moonshine STT and Kokoro TTS run on-device; the models
   ship inside the app. Audio never leaves the machine — only the final text of a
   command goes to Claude, on your own subscription. No audio cloud, no third-party
   keys, no telemetry.
5. **An appliance, not an app.** Boots fullscreen at login, recovers from crashes, mic
   disconnects, and network drops on its own (spoken fallbacks — never a silent hang),
   and writes a daily local log so you can see exactly what it heard, said, and spent.
6. **Looks the part.** A flat, instrument-console HUD — hairline panels, monospace
   readouts, and a tick-ring gauge that ripples with the live audio. Built to be left
   on a wall.

## Audience

- Primary: Claude Pro/Max subscribers with a spare/desk Mac who want a "Jarvis at
  home" — developers, tinkerers, smart-home people burned by dumb assistants.
- Secondary: privacy-conscious households that refuse cloud microphones.
- Tertiary: offices/studios wanting a shared voice console on a wall display.

## Business model (recommendation)

**Pay once, bring your own Claude.** One-time license (suggested **$29**, 14-day free
trial), because the recurring cost is the user's existing Claude subscription — a
second subscription on top would feel hostile. Costs to the maker are near zero
(no audio cloud, no inference bill). Alternative if reach > revenue: open-source the
core (MIT) and sell signed, notarized, auto-updating builds — the "pay for the
convenience" model that works for indie Mac apps.

Requirements to state plainly everywhere: macOS (Apple Silicon), a Claude Pro/Max
subscription with the `claude` CLI logged in, a mic. ~1.2GB disk (models included).

## Landing page copy (v1)

- **Hero:** Say "Claude." — *Your Mac, but it answers.* [Download for macOS] —
  sub: A Jarvis-style voice console powered by Claude. Local ears, local voice,
  frontier brain.
- **Show, don't tell:** 20-second loop video — wake from across the room → "what's
  the weather" answered in a second → a real question with web search → the follow-up
  question answered without re-waking.
- **Three columns:** Alexa-fast (local fast path, ~1s) · Claude-smart (search,
  memory, reasoning) · Nothing leaves the room (on-device audio, shipped models).
- **The console:** full-bleed screenshot of the HUD mid-speech.
- **Receipts:** the latency table and the privacy architecture diagram (mic → local
  STT → text → Claude; audio never crosses the line).
- **FAQ + requirements + price.**

## FAQ (drafts)

- **Does my audio go to the cloud?** No. Speech-to-text and text-to-speech run
  on-device; models ship inside the app. Only the final text of your command goes to
  Claude — on your own subscription, under Anthropic's terms.
- **Do I need an API key?** No. It uses your Claude Pro/Max login (the `claude` CLI).
  Usage draws from your subscription.
- **What's actually fast?** Time/timers/weather: ~1s, answered locally. Claude
  questions: first spoken words in ~2–2.5s, web-search questions a bit longer.
- **Can I change the wake word / voice?** Voice: one constant (Kokoro ships many).
  Wake word: "Claude" today; configurable wake is on the roadmap.
- **Offline?** Wake, transcription, speech, timers, and time work offline. Claude and
  web search need a connection — failures are spoken, not silent.

## Launch checklist

Done in repo:
- [x] v1.0 feature set complete (8 phases — see [timeline.md](timeline.md))
- [x] App icon in the house style (`build/icon.icns`)
- [x] DMG build (`npm run package:dmg`)
- [x] Crash/error self-recovery + daily local logs
- [x] Models shipped in-bundle (no first-run download)
- [x] **Node runtime bundled** (`Resources/bin/node`, staged at build) — end users
      need nothing installed; the STT sidecar and the Claude CLI both use it.
- [x] **Login detection** — the HUD's System panel shows "Claude · ready / needs
      login" with a toast pointing at `claude` → `/login`; mic permission already
      prompts in-app.
- [x] **Install one-liner** + installer script ([scripts/install.sh](scripts/install.sh)):
      `curl -fsSL https://raw.githubusercontent.com/bournechoi4353/C.V.A/main/scripts/install.sh | bash`
- [x] **License** (source-available, [LICENSE](LICENSE)) + **privacy page**
      ([PRIVACY.md](PRIVACY.md))
- [x] **v1.0.0 GitHub Release** with the DMG (what the one-liner installs)

Required before charging money / wide distribution:
- [ ] **Apple Developer ID + codesign + notarization** — the installer currently
      clears quarantine itself; signed + notarized builds remove that crutch and the
      scary Gatekeeper posture. ($99/yr; set `mac.identity` + notarize config.)
- [ ] **Auto-update** (electron-updater + GitHub Releases; requires signing on macOS).
- [ ] **24h soak test** — leave the packaged app running a day; the logs grade it.
- [ ] Domain + landing page + the 20-second demo video.
- [ ] Licensing/trial mechanics if charging (Paddle/Lemon Squeezy for a $29 license).
- [ ] Universal build (x64 + arm64) if supporting Intel Macs — currently arm64.

## Roadmap whispers (v1.x material, from the backlog)

Configurable wake word · voice picker · vision ("Claude, what am I holding?") ·
proactive mode (meetings, reminders) · Home Assistant control · multi-display kiosk.
