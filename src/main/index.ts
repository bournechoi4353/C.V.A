import { app, BrowserWindow, ipcMain, session, systemPreferences } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { resetConversation, warm, setUsageListener } from './cva'
import { ensureTts, synthesize, floatToInt16 } from './tts'
import { streamTurn } from './pipeline'
import { tryFastPath } from './fastpath'
import { setToolEmitter } from './tools'
import { ensureStt, transcribe, setSttProgress } from './stt'
import { getProfile, listMemories } from './memory'
import { log, initLogs } from './logger'

// Web Audio must be allowed to start without a user gesture — the first spoken reply
// (and timer alerts) play with no click/keypress preceding them.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// ---- Crash recovery (Phase 8) ----
// A main-process crash relaunches the app — unless we've crashed 3+ times in 10 minutes
// (a crash loop, e.g. a bad install), in which case stay down rather than flap forever.
function shouldRelaunch(): boolean {
  try {
    const f = join(app.getPath('userData'), 'crash-times.json')
    let times: number[] = []
    try {
      times = JSON.parse(readFileSync(f, 'utf8'))
    } catch {
      /* first crash */
    }
    const now = Date.now()
    times = times.filter((t) => now - t < 10 * 60_000)
    times.push(now)
    writeFileSync(f, JSON.stringify(times))
    return times.length <= 3
  } catch {
    return true
  }
}
process.on('uncaughtException', (err) => {
  log('crash', `uncaught exception: ${err?.stack ?? err}`)
  if (app.isPackaged && shouldRelaunch()) {
    log('crash', 'relaunching')
    app.relaunch()
  }
  app.exit(1)
})
process.on('unhandledRejection', (reason) => {
  log('error', `unhandled rejection: ${reason}`)
})

// Appliance mode: fullscreen when packaged (or CVA_KIOSK=1); CVA_WINDOWED=1 overrides.
const KIOSK = (app.isPackaged || !!process.env.CVA_KIOSK) && !process.env.CVA_WINDOWED

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    fullscreen: KIOSK,
    backgroundColor: '#0b0b0c',
    show: false,
    autoHideMenuBar: true,
    title: 'C.V.A',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  // Renderer crash/hang recovery: reload instead of leaving a dead screen.
  win.webContents.on('render-process-gone', (_e, details) => {
    log('crash', `renderer gone (${details.reason}) — reloading`)
    if (details.reason !== 'clean-exit') win.webContents.reload()
  })
  win.on('unresponsive', () => {
    log('crash', 'renderer unresponsive — force-reloading')
    win.webContents.forcefullyCrashRenderer() // render-process-gone handler reloads
  })

  // Tools (weather card, timer alerts) push side-channel updates to this window.
  setToolEmitter((channel, payload) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })

  // STT model download progress → renderer.
  setSttProgress((progress) => {
    if (!win.isDestroyed()) win.webContents.send('cva:stt-progress', { progress })
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev; load the built file otherwise.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  void initLogs()
  log('app', `started · v${app.getVersion()} · packaged=${app.isPackaged} · kiosk=${KIOSK}`)

  // Packaged builds: start at login so the machine boots into the assistant
  // (CVA_NO_AUTOSTART=1 to opt out). Models ship inside the app (module-relative
  // caches), so there's no first-run download; CVA_MODELS_DIR remains as a manual
  // override for the STT worker's cache.
  if (app.isPackaged) {
    if (!process.env.CVA_NO_AUTOSTART) app.setLoginItemSettings({ openAtLogin: true })
    // Apps launched from Finder/login don't inherit a shell PATH — make sure the
    // system Node (STT worker + the SDK's CLI) is findable.
    if (process.platform === 'darwin') {
      process.env.PATH = `${process.env.PATH ?? '/usr/bin:/bin'}:/opt/homebrew/bin:/usr/local/bin`
    }
  }

  // Per-turn token usage → log + HUD Session widget.
  setUsageListener((u) => {
    log(
      'usage',
      `in ${u.inputTokens + u.cacheRead + u.cacheWrite} (cache ${u.cacheRead}r/${u.cacheWrite}w) · ` +
        `out ${u.outputTokens} · $${u.costUsd.toFixed(4)} · api ${(u.durationMs / 1000).toFixed(1)}s`,
    )
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('cva:usage', u)
    }
  })

  // Allow microphone access for the renderer (the OS still gates it via TCC on macOS).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })

  // Streaming turn: streams Claude's reply, synthesizes it sentence-by-sentence, and
  // emits `cva:turn-text` (deltas) + `cva:turn-audio` (per-sentence audio) to the
  // renderer. Resolves with the full text when the turn completes.
  let cancelFlag = false
  ipcMain.handle('cva:ask-stream', async (event, text: string) => {
    cancelFlag = false
    let emitted = false // any text/audio reached the renderer for this turn?
    const send = (channel: string, payload: unknown) => {
      if (channel === 'cva:turn-text' || channel === 'cva:turn-audio') emitted = true
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
    }
    log('turn', `user: ${text}`)
    try {
      // Alexa-style fast path: time/timer/weather answered locally (<1s) — anything
      // the conservative parser doesn't match takes the normal Claude turn.
      const fast = await tryFastPath(text, send, () => cancelFlag)
      if (fast !== null) {
        log('turn', `claude (fastpath): ${fast}`)
        return { text: fast }
      }

      let full: string
      try {
        full = await streamTurn(text, send, () => cancelFlag)
      } catch (err) {
        // Retry once IF the turn died before anything reached the user (session crash,
        // network blip) — a retry after partial speech would repeat itself.
        if (cancelFlag || emitted) throw err
        log('error', `turn failed before output (${err instanceof Error ? err.message : err}) — retrying once`)
        resetConversation()
        full = await streamTurn(text, send, () => cancelFlag)
      }
      log('turn', `claude: ${full}`)
      return { text: full }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', `turn failed: ${message}`)
      // Spoken + visual failure — never a silent hang.
      try {
        if (!cancelFlag) {
          const { samples, rate } = await synthesize('Sorry — something went wrong. Try that again in a moment.')
          if (!cancelFlag) send('cva:turn-audio', { seq: 0, samples: floatToInt16(samples), rate })
        }
      } catch {
        /* TTS down too — the HUD error text still shows */
      }
      return { error: message }
    }
  })

  // Barge-in: stop emitting audio/text for the in-flight turn.
  ipcMain.handle('cva:cancel', () => {
    cancelFlag = true
  })

  ipcMain.handle('cva:reset', () => {
    resetConversation()
  })

  // Initial profile + memories for the HUD (live updates arrive via cva:profile/cva:memory).
  ipcMain.handle('cva:get-profile', () => ({
    profile: getProfile(),
    memories: listMemories(),
  }))

  // Warm up the Claude session + speech models in the background so the first turn is fast.
  warm().catch((err) => console.error('[cva] warm failed:', err))
  ensureTts().catch((err) => console.error('[tts] warmup failed:', err))
  ensureStt().catch((err) => console.error('[stt] warmup failed:', err))

  // Ensure the STT worker/model is ready; returns ok/error to the renderer.
  ipcMain.handle('cva:stt-ensure', async () => {
    try {
      await ensureStt()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Transcribe mono 16kHz Float32 audio → { text } or { error }.
  ipcMain.handle('cva:transcribe', async (_event, samples: Float32Array) => {
    // Under ~0.2s can't hold a word — skip the model call (accidental taps, VAD blips).
    if (!samples || samples.length < 3200) return { text: '' }
    try {
      return { text: await transcribe(samples) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Ensure the TTS model is loaded; returns ok/error to the renderer.
  ipcMain.handle('cva:tts-ensure', async () => {
    try {
      await ensureTts()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Trigger the macOS microphone permission prompt. Renderer getUserMedia alone does
  // NOT prompt in Electron — the main process has to ask for OS-level (TCC) access.
  // Returns 'granted' | 'denied' | 'restricted' | 'unsupported'.
  ipcMain.handle('cva:request-mic', async () => {
    if (process.platform !== 'darwin') return 'granted'
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return 'granted'
    if (status === 'not-determined') {
      const ok = await systemPreferences.askForMediaAccess('microphone')
      return ok ? 'granted' : 'denied'
    }
    // 'denied' or 'restricted' — user must change it in System Settings.
    return status
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
