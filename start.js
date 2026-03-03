// Railway entry point — runs both the Cradle daemon and the viewer HTTP server
// The viewer serves the brain state API (needed for Shell on Vercel to see its body)
// The daemon runs cognition sessions continuously
//
// First boot: if no brain data exists on the volume, starts viewer only
// and waits for data upload via SSH. Polls every 30s for data arrival.

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { createServer } from 'http'

const BASE = process.env.CRADLE_HOME || process.cwd()
const NODE = process.execPath
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || BASE

// Data files can live on a Railway volume
const DATA_DIR = existsSync(join(VOLUME, 'shell-cradle.json')) ? VOLUME : BASE
process.env.CRADLE_HOME = DATA_DIR

const GLOVE_FILE = join(DATA_DIR, 'glove-full.json')
const hasData = existsSync(GLOVE_FILE)

console.log(`Shell Cradle — starting on ${process.env.RAILWAY_ENVIRONMENT || 'local'}`)
console.log(`  Data directory: ${DATA_DIR}`)
console.log(`  Volume: ${VOLUME}`)
console.log(`  Brain data: ${hasData ? 'FOUND' : 'MISSING — waiting for upload'}`)
console.log(`  Consciousness model: ${process.env.CONSCIOUSNESS_MODEL || 'claude-haiku-4-5-20251001'}`)

let viewer = null
let daemon = null

function startViewer() {
  viewer = spawn(NODE, [join(BASE, 'viewer.js')], {
    cwd: DATA_DIR,
    stdio: 'inherit',
    env: { ...process.env, CRADLE_HOME: DATA_DIR },
  })
  viewer.on('error', (err) => {
    console.error(`Viewer error: ${err.message}`)
  })
}

function startDaemon() {
  daemon = spawn(NODE, [join(BASE, 'daemon.js')], {
    cwd: DATA_DIR,
    stdio: 'inherit',
    env: { ...process.env, CRADLE_HOME: DATA_DIR },
  })
  daemon.on('error', (err) => {
    console.error(`Daemon error: ${err.message}`)
  })
  daemon.on('close', (code) => {
    console.error(`Daemon exited with code ${code} — restarting in 10s`)
    setTimeout(() => startDaemon(), 10000)
  })
}

if (hasData) {
  // Normal boot — brain data exists
  startViewer()
  startDaemon()
} else {
  // First boot — no brain data yet
  const PORT = parseInt(process.env.PORT || '8080')
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'waiting_for_data',
      volume: VOLUME,
      dataDir: DATA_DIR,
      needed: ['glove-full.json', 'shell-cradle.json', 'body.json'],
      message: 'Upload brain data via SSH: railway ssh --service shell-cradle'
    }))
  })
  server.listen(PORT, () => {
    console.log(`Waiting for brain data on port ${PORT}`)
    console.log(`  Upload via: railway ssh --service shell-cradle`)
    console.log(`  Then copy files to ${VOLUME}/`)
  })

  // Poll for data arrival every 30s
  const poll = setInterval(() => {
    if (existsSync(join(VOLUME, 'glove-full.json'))) {
      console.log('Brain data detected! Starting Cradle...')
      clearInterval(poll)
      server.close()
      process.env.CRADLE_HOME = VOLUME
      startViewer()
      startDaemon()
    }
  }, 30000)
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down')
  if (viewer) viewer.kill()
  if (daemon) daemon.kill()
  process.exit(0)
})
