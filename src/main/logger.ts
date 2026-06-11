// Main-process logging: every line goes to the console (dev) AND a daily log file in
// the app data dir (debugging unattended runs — Phase 8 telemetry). Appends are chained
// so lines never interleave; files older than 7 days are pruned at startup.

import { app } from 'electron'
import { join } from 'node:path'
import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises'

const KEEP_DAYS = 7

let dir = ''
let chain: Promise<unknown> = Promise.resolve()

function logDir(): string {
  if (!dir) dir = join(app.getPath('userData'), 'logs')
  return dir
}

function fileForToday(): string {
  return join(logDir(), `cva-${new Date().toISOString().slice(0, 10)}.log`)
}

/** Log a line to console + today's log file. Tags: timing / turn / usage / error / crash / app / …. */
export function log(tag: string, message: string): void {
  console.log(`[${tag}] ${message}`)
  const line = `${new Date().toISOString()} [${tag}] ${message}\n`
  chain = chain.then(() => appendFile(fileForToday(), line)).catch(() => {})
}

/** Create the log dir and prune old files. Call once at startup. */
export async function initLogs(): Promise<void> {
  try {
    await mkdir(logDir(), { recursive: true })
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000
    for (const name of await readdir(logDir())) {
      const m = /^cva-(\d{4}-\d{2}-\d{2})\.log$/.exec(name)
      if (m && new Date(m[1]).getTime() < cutoff) {
        await unlink(join(logDir(), name)).catch(() => {})
      }
    }
  } catch (err) {
    console.error('[logger] init failed:', err)
  }
}
