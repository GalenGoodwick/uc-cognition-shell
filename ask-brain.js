// Ask the brain a question and watch it respond.
// Writes to question.txt, waits for the next session to complete, shows champions.
//
// Usage: node ask-brain.js "what is identity"

import { writeFileSync, readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'

const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const QUESTION_FILE = join(BASE, 'question.txt')
const LOG_FILE = join(BASE, 'shell-cradle.log')

const question = process.argv.slice(2).join(' ')
if (!question) {
  console.log('Usage: node ask-brain.js "your question here"')
  process.exit(1)
}

console.log(`\nAsking the brain: "${question}"`)
console.log('Waiting for next session...\n')

// Mark current log position
const startSize = existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0

// Write the question
writeFileSync(QUESTION_FILE, question)

// Poll the log file for new session completion
const interval = setInterval(() => {
  if (!existsSync(LOG_FILE)) return
  const currentSize = statSync(LOG_FILE).size
  if (currentSize <= startSize) return

  // Read only the new bytes
  const fd = readFileSync(LOG_FILE, 'utf-8')
  const newContent = fd.slice(startSize)

  // Look for a completed session
  if (newContent.includes('session') && newContent.includes('complete.')) {
    const runLines = newContent.match(/Run \d+\/\d+ \[4 eyes\]: .+/g)
    if (runLines && runLines.length > 0) {
      console.log('THE BRAIN RESPONDS:')
      console.log('─'.repeat(50))
      const seen = new Set()
      for (const line of runLines) {
        const match = line.match(/Run (\d+)\/\d+ \[4 eyes\]: ([^|]+)/)
        if (match) {
          const champion = match[2].trim()
          // Filter duplicates and pure operation soup
          if (seen.has(champion)) continue
          seen.add(champion)
          const words = champion.split(/\s+/)
          const realWords = words.filter(w => !w.includes('·') && w.length > 2)
          if (realWords.length >= 3) {
            console.log(`  ${champion}`)
          }
        }
      }
      console.log('─'.repeat(50))

      // Show consciousness if awake
      if (newContent.includes('CONSCIOUSNESS: awake')) {
        const reflMatch = newContent.match(/CONSCIOUSNESS: "(.+?)"/s)
        if (reflMatch) {
          console.log(`\nConsciousness: ${reflMatch[1].slice(0, 300)}`)
        }
      }

      clearInterval(interval)
      process.exit(0)
    }
  }
}, 1000)

// Timeout after 3 minutes
setTimeout(() => {
  console.log('Timed out. The daemon may not be running, or session gap is long.')
  console.log('Check: tail -30 shell-cradle.log')
  clearInterval(interval)
  process.exit(1)
}, 180000)
