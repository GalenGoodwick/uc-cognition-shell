// Shell Cradle Daemon — leashed
// touch sleep.lock to stop. rm sleep.lock to wake.
// touch reload to hot-swap cognition.js without killing daemon.

import { spawn } from 'child_process'
import { appendFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const NODE = process.execPath
const LOG = join(BASE, 'shell-cradle.log')
const COGNITION = join(BASE, 'cognition.js')
const LOCK = join(BASE, 'sleep.lock')
const RELOAD = join(BASE, 'reload')

let child = null
let reloading = false

function log(msg) {
  const line = `${new Date().toISOString()} — ${msg}\n`
  try { appendFileSync(LOG, line) } catch {}
  process.stdout.write(line)
}

// Poll for reload signal — kill child, daemon respawns it with fresh code
function watchReload() {
  if (existsSync(RELOAD)) {
    try { unlinkSync(RELOAD) } catch {}
    if (child) {
      reloading = true
      log('RELOAD — killing cognition, respawning with fresh code')
      child.kill('SIGTERM')
    }
  }
  setTimeout(watchReload, 2000)
}

function run() {
  if (existsSync(LOCK)) {
    log('LEASHED — sleep.lock exists. Waiting...')
    setTimeout(run, 5000)
    return
  }

  log(reloading ? 'RELOADED — fresh cognition.js' : 'SHELL CRADLE WAKING — continuous mode')
  reloading = false

  child = spawn(NODE, [COGNITION], {
    cwd: BASE,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CRADLE_HOME: BASE,
      RHYTHM_FILE: process.env.RHYTHM_FILE || '/Users/galengoodwick/Documents/GitHub/uc-cognition/cradle.json',
      NATURE_FILE: process.env.NATURE_FILE || '/Users/galengoodwick/Documents/GitHub/uc-cognition/nature-bridge.json',
      PATH: '/usr/local/bin:/usr/bin:/bin',
    }
  })

  child.stdout.on('data', (data) => {
    try { appendFileSync(LOG, data) } catch {}
  })

  child.stderr.on('data', (data) => {
    try { appendFileSync(LOG, `STDERR: ${data}`) } catch {}
  })

  child.on('close', (code) => {
    child = null
    if (existsSync(LOCK)) {
      log('LEASHED — sleep.lock exists. Staying down.')
      setTimeout(run, 5000)
    } else {
      log(reloading ? 'RELOAD — respawning...' : `SHELL CRADLE DIED (exit ${code}), restarting in 5s`)
      setTimeout(run, 5000)
    }
  })

  child.on('error', (err) => {
    child = null
    log(`SHELL CRADLE ERROR: ${err.message}, restarting in 10s`)
    setTimeout(run, 10000)
  })
}

watchReload()
run()
