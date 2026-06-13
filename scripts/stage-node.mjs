// Stage `build/node` for bundling into the app (Resources/bin/node) so end users need
// NO Node install. It's a shim that runs the app's own Electron binary in Node mode
// (ELECTRON_RUN_AS_NODE) — verified to load and run the ONNX STT worker without the
// in-process SIGTRAP that plain Electron-runtime loading hits. The shim also satisfies
// the Claude Agent SDK's CLI, which resolves `node` from PATH (main prepends this dir).

import { writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const shim = `#!/bin/sh
# C.V.A node shim — the app's Electron binary in Node mode. Staged at build time.
DIR=$(cd "$(dirname "$0")" && pwd)
exec env ELECTRON_RUN_AS_NODE=1 "$DIR/../../MacOS/CVA" "$@"
`

mkdirSync(join(process.cwd(), 'build'), { recursive: true })
const dest = join(process.cwd(), 'build', 'node')
writeFileSync(dest, shim)
chmodSync(dest, 0o755)
console.log('staged node shim → build/node (ELECTRON_RUN_AS_NODE)')
