import { app, BrowserWindow, ipcMain, session, systemPreferences } from 'electron'
import { join } from 'node:path'
import { resetConversation, warm } from './cva'
import { ensureTts } from './tts'
import { streamTurn } from './pipeline'
import { setToolEmitter } from './tools'
import { ensureStt, transcribe, setSttProgress } from './stt'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#05070d',
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
    const send = (channel: string, payload: unknown) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
    }
    try {
      const full = await streamTurn(text, send, () => cancelFlag)
      return { text: full }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[cva] streamTurn failed:', message)
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
