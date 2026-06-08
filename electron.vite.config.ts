import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Main + preload run in Node (Electron). externalizeDepsPlugin keeps node_modules
// deps external so the ESM-only Claude Agent SDK is resolved at runtime (we load it
// via dynamic import in src/main/cva.ts) rather than being bundled.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
})
