import { app, BrowserWindow, ipcMain, session, systemPreferences } from 'electron'
import { join } from 'node:path'
import { ask, resetConversation, warm } from './cva'
import { ensureTts, synthesize } from './tts'

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

  ipcMain.handle('cva:send', async (_event, text: string) => {
    try {
      const reply = await ask(text)
      return { text: reply.text }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[cva] ask failed:', message)
      return { text: '', error: message }
    }
  })

  ipcMain.handle('cva:reset', () => {
    resetConversation()
  })

  // Warm up the Claude session + TTS model in the background so the first turn is fast.
  warm().catch((err) => console.error('[cva] warm failed:', err))
  ensureTts().catch((err) => console.error('[tts] warmup failed:', err))

  // Ensure the TTS model is loaded; returns ok/error to the renderer.
  ipcMain.handle('cva:tts-ensure', async () => {
    try {
      await ensureTts()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Synthesize speech for text → { samples: Float32Array, rate } or { error }.
  ipcMain.handle('cva:speak', async (_event, text: string) => {
    try {
      return await synthesize(text)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[tts] synthesize failed:', message)
      return { error: message }
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
