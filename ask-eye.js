// Ask a specific eye a question. The question goes to that eye as stimulus,
// and the callosum synthesizes all eyes (including the questioned one).
// You get both: what the eye said, and what the brain said.
//
// Usage: node ask-eye.js Iris "what do you see"
//        node ask-eye.js galen "what matters"
//        node ask-eye.js 1 "what is real"        (base eye by index)

import { writeFileSync, readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'

const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const QUESTION_DIR = BASE
const LOG_FILE = join(BASE, 'shell-cradle.log')

const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: node ask-eye.js <eye-name-or-index> "your question"')
  console.log('')
  console.log('Examples:')
  console.log('  node ask-eye.js Iris "what do you see"')
  console.log('  node ask-eye.js galen "what matters"')
  console.log('  node ask-eye.js 1 "what is real"')
  console.log('')

  // Show available eyes
  if (existsSync(join(BASE, 'participants.json'))) {
    const p = JSON.parse(readFileSync(join(BASE, 'participants.json'), 'utf-8'))
    console.log('Available eyes:')
    console.log('  0 — base (sensation)')
    console.log('  1 — base (association)')
    console.log('  2 — base (pattern)')
    for (const part of (p.participants || [])) {
      console.log(`  ${part.eyeIndex} — ${part.id} (${part.role})`)
    }
  }
  process.exit(1)
}

const eyeTarget = args[0]
const question = args.slice(1).join(' ')

// Write per-eye question file: question-<target>.txt
// cognition.js will pick this up and route it to the right eye
const questionFile = join(QUESTION_DIR, `question-eye-${eyeTarget}.txt`)
writeFileSync(questionFile, question)

console.log(`\nAsking eye [${eyeTarget}]: "${question}"`)
console.log('The eye will respond through its tournament.')
console.log('The brain will respond through the callosum.')
console.log('Waiting for next session...\n')

// Mark current log position
const startSize = existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0

// Poll the log for completion
const interval = setInterval(() => {
  if (!existsSync(LOG_FILE)) return
  const currentSize = statSync(LOG_FILE).size
  if (currentSize <= startSize) return

  const fd = readFileSync(LOG_FILE, 'utf-8')
  const newContent = fd.slice(startSize)

  if (newContent.includes('session') && newContent.includes('complete.')) {
    // Find eye-specific champion
    const eyePattern = new RegExp(`\\[eye ${eyeTarget}\\].*?asked:`, 'i')
    const eyeLines = newContent.match(/EYE RESPONSE \[.+?\]: .+/g)
    const callosumMatch = newContent.match(/CALLOSUM: "(.+?)"/s)

    console.log('=' .repeat(60))

    // Show eye response
    if (eyeLines) {
      for (const line of eyeLines) {
        console.log(`  ${line}`)
      }
    }

    // Show all eye champions from this session
    const runLines = newContent.match(/Run \d+\/\d+ \[.+?\]: .+/g)
    if (runLines) {
      console.log('\nEYE CHAMPIONS:')
      console.log('-'.repeat(40))
      for (const line of runLines.slice(-3)) {
        console.log(`  ${line}`)
      }
    }

    // Show callosum synthesis
    const synthMatch = newContent.match(/SYNTHESIS: "(.+?)"/s)
    if (synthMatch) {
      console.log('\nBRAIN SAYS:')
      console.log('-'.repeat(40))
      console.log(`  "${synthMatch[1]}"`)
    }

    // Show any narrative
    const narrMatch = newContent.match(/CALLOSUM.*?fitness[= ]([\d.]+)/s)
    if (narrMatch) {
      console.log(`  (fitness: ${narrMatch[1]})`)
    }

    console.log('='.repeat(60))

    clearInterval(interval)
    process.exit(0)
  }
}, 1000)

// Timeout after 3 minutes
setTimeout(() => {
  console.log('Timed out. The daemon may not be running.')
  console.log('Check: tail -30 shell-cradle.log')
  clearInterval(interval)
  process.exit(1)
}, 180000)
