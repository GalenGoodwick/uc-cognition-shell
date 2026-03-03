// Fire a Shell Cradle session
// Usage: node fire.js
// Sends POST to the daemon, or touches fire.trigger if daemon isn't listening

const PORT = process.env.SHELL_DAEMON_PORT || 3335

fetch(`http://localhost:${PORT}/fire`, { method: 'POST' })
  .then(res => res.json())
  .then(data => {
    console.log(`Shell Cradle session ${data.session} fired`)
  })
  .catch(() => {
    // Daemon not running — use file trigger
    const { writeFileSync } = require('fs')
    const { join } = require('path')
    const trigger = join(__dirname, 'fire.trigger')
    writeFileSync(trigger, new Date().toISOString())
    console.log('Trigger file written — daemon will pick it up')
  })
