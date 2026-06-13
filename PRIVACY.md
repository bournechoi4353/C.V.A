# C.V.A — Privacy

The short version: **your audio never leaves your Mac.**

## What stays on-device

- **All audio.** Wake-word detection, voice activity detection, speech-to-text
  (Moonshine), and text-to-speech (Kokoro) run entirely on your machine. The speech
  models ship inside the app — no audio is ever uploaded, streamed, or stored remotely.
- **Your memory and profile.** Facts C.V.A remembers (name, location, preferences) live
  in a local JSON file in the app's data folder.
- **Logs.** Daily logs (what was heard, said, timing, token usage) are written locally,
  kept 7 days, and never transmitted.

## What leaves the device

- **The text of a command** (and only the text) is sent to Anthropic's Claude when a
  request needs the model — under your own Claude subscription and
  [Anthropic's privacy terms](https://www.anthropic.com/legal/privacy). Local fast-path
  answers (time, timers, weather) don't involve Claude at all.
- **Weather lookups** call the free Open-Meteo API with a place name (no account, no
  identifiers).
- **Web search**, when Claude uses it, runs on Anthropic's infrastructure as part of
  your Claude subscription.

## What we collect

Nothing. C.V.A has no analytics, no telemetry, no crash reporting to us, no accounts,
and no servers of its own.

## Microphone

macOS will ask for microphone permission on first use. The on-screen indicator
("● Listening for 'Claude'") and macOS's own mic indicator show whenever the always-on
listener is active. Toggle hands-free off and the microphone is released entirely.
