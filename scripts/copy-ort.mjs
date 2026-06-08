// Copy the onnxruntime-web runtime (.mjs loaders + .wasm) into the renderer's public
// dir so it's served same-origin by the app. This avoids CSP problems with dynamically
// imported modules and removes any dependency on a CDN / specific published version.
// Runs automatically via the predev / prebuild npm scripts.

import { mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const dest = join(root, 'src', 'renderer', 'public', 'ort')

mkdirSync(dest, { recursive: true })

const files = readdirSync(src).filter(
  (f) =>
    f.startsWith('ort-wasm-simd-threaded.') && (f.endsWith('.mjs') || f.endsWith('.wasm')),
)

for (const f of files) {
  copyFileSync(join(src, f), join(dest, f))
}

console.log(`[copy-ort] copied ${files.length} onnxruntime files to src/renderer/public/ort/`)
