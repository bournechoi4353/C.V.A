# C.V.A, the voice console for Claude

Say Claude and the computer will respond to you. Thus the name, C.V.A, Claude Voice Assistant!

## Install

On an Apple Silicon Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/bournechoi4353/C.V.A/main/scripts/install.sh | bash
```

This command grabs the latest release of the app(about 470MB, with the speech models and a Node runtime
inside, so there's nothing else to install), drops `CVA.app` in /Applications, and opens
it. As the app asks,allow the microphone, turn on hands-free, and say "Claude" to begin using the app. 

You'll also need a Claude Pro or Max subscription with the `claude` CLI logged in:

```bash
npm i -g @anthropic-ai/claude-code
claude          # then /login
```

The app runs on Claude SDK so you never have to input your own Claude API Key, it only drains your Claude Subscriptoin. 

## How it works

When you talk, it hears you on device, the orb pulses as a visual cue, and your voice is input. 

- **Hearing.** Speech-to-text is through using Moonshine
  running locally. It's built for short commands, so a couple seconds of speech becomes
  text in around a tenth of a second. Hold the mic button or the spacebar to talk, or go
  hands-free and say "Claude". 
- **Thinking.** Claude (Haiku, for speed) over the Claude Agent SDK, with live web
  search and a memory of your name, location, and preferences that survives restarts.
- **Speaking.** Uses Kokoro, a locally hosted voice that is both quick and sounds realistic enough
  for the purposes of this project. 


## Developers

```bash
npm install
npm run dev      # HUD with hot reload
```


