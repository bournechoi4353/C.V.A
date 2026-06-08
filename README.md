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

A window opens with the HUD. Type in the box at the bottom and press Enter — Claude's
reply appears in the transcript, and the orb pulses while it's thinking.

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
    index.ts   window + IPC handlers
    cva.ts     Claude Agent SDK wrapper (subscription auth, conversation state)
  preload/     contextBridge: window.cva.send() / .reset()
  renderer/    React HUD
    src/
      components/  HUD, StatusOrb, ClockWidget, SidePanel, TranscriptStrip, ChatInput
      store.ts     Zustand state (status + messages)
      styles.css   Jarvis theme
```

## Notes

- Model is set in [src/main/cva.ts](src/main/cva.ts) (`MODEL`) — currently
  `claude-opus-4-8`. Switch to `claude-sonnet-4-6` for lower latency.
- Voice in/out is **Phase 2/3** — for now interaction is text.
