const { app, systemPreferences } = require('electron')
app.whenReady().then(() => {
  try {
    console.log('status:', systemPreferences.getMediaAccessStatus('microphone'))
  } catch (e) { console.log('err:', e.message) }
  app.quit()
})
