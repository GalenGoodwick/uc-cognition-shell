// Sync Human Corpus — pulls Galen's platform activity into brain corpus
// Run periodically (cron) or manually. Writes human-corpus.json.
// The brain samples from this each session as Eye 5's base corpus.
//
// Sources:
//   1. CollectiveMessage — conversations with Shell
//   2. Idea — ideas submitted to chants
//   3. Vote → Idea — ideas voted for (what you value)
//   4. IdeaRevision — how you refined others' ideas
//   5. ChallengeLog — chase-the-button telemetry (behavioral fingerprint)

import pg from 'pg'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve('/Users/galengoodwick/Documents/GitHub/unionchant/web/.env.local') })

const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const CORPUS_FILE = join(BASE, 'human-corpus.json')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

async function main() {
  // Find admin user
  const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0]?.trim()
  if (!adminEmail) { console.error('No ADMIN_EMAILS in env'); process.exit(1) }

  const userRes = await pool.query('SELECT id, name FROM "User" WHERE email = $1', [adminEmail])
  if (userRes.rows.length === 0) { console.error('Admin user not found'); process.exit(1) }
  const userId = userRes.rows[0].id
  const userName = userRes.rows[0].name || 'Galen'
  console.log(`Syncing corpus for ${userName} (${userId})`)

  const corpus = {
    syncedAt: new Date().toISOString(),
    userId,
    userName,
    phrases: [],      // text phrases for the tournament
    behavioral: [],   // chase-the-button telemetry
  }

  // 1. CollectiveMessage — your words to Shell
  const messages = await pool.query(
    `SELECT content FROM "CollectiveMessage" WHERE "userId" = $1 AND role = 'user' ORDER BY "createdAt" DESC LIMIT 200`,
    [userId]
  )
  for (const row of messages.rows) {
    const sentences = row.content.split(/[.\n!?]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 3 && s.split(/\s+/).length >= 2 && s.split(/\s+/).length <= 15)
    corpus.phrases.push(...sentences.map(s => ({ text: s, source: 'shell-conversation' })))
  }
  console.log(`  Shell conversations: ${messages.rows.length} messages → ${corpus.phrases.length} phrases`)

  // 2. Idea — ideas you submitted to chants
  const ideas = await pool.query(
    `SELECT text, "isChampion", tier FROM "Idea" WHERE "authorId" = $1 ORDER BY "createdAt" DESC LIMIT 200`,
    [userId]
  )
  const beforeIdeas = corpus.phrases.length
  for (const row of ideas.rows) {
    const text = row.text.trim().toLowerCase()
    if (text.length > 3 && text.split(/\s+/).length >= 2) {
      corpus.phrases.push({
        text,
        source: 'idea',
        champion: row.isChampion,
        tier: row.tier,
      })
    }
  }
  console.log(`  Ideas submitted: ${ideas.rows.length} → ${corpus.phrases.length - beforeIdeas} phrases`)

  // 3. Vote → Idea — ideas you voted for
  const votes = await pool.query(
    `SELECT i.text, v."xpPoints" FROM "Vote" v JOIN "Idea" i ON v."ideaId" = i.id WHERE v."userId" = $1 ORDER BY v."votedAt" DESC LIMIT 200`,
    [userId]
  )
  const beforeVotes = corpus.phrases.length
  for (const row of votes.rows) {
    const text = row.text.trim().toLowerCase()
    if (text.length > 3 && text.split(/\s+/).length >= 2) {
      corpus.phrases.push({
        text,
        source: 'vote',
        xp: row.xpPoints,
      })
    }
  }
  console.log(`  Votes cast: ${votes.rows.length} → ${corpus.phrases.length - beforeVotes} phrases`)

  // 4. IdeaRevision — how you refined others' ideas
  const revisions = await pool.query(
    `SELECT "proposedText" FROM "IdeaRevision" WHERE "proposedById" = $1 ORDER BY "createdAt" DESC LIMIT 50`,
    [userId]
  )
  const beforeRevisions = corpus.phrases.length
  for (const row of revisions.rows) {
    const text = row.proposedText.trim().toLowerCase()
    if (text.length > 3 && text.split(/\s+/).length >= 2) {
      corpus.phrases.push({ text, source: 'revision' })
    }
  }
  console.log(`  Revisions: ${revisions.rows.length} → ${corpus.phrases.length - beforeRevisions} phrases`)

  // 5. ChallengeLog — chase-the-button behavioral fingerprint
  const challenges = await pool.query(
    `SELECT result, "pointerEvents", "chaseDurationMs", "evadeCount", surrendered, "chasePath" FROM "ChallengeLog" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 50`,
    [userId]
  )
  for (const row of challenges.rows) {
    const entry = {
      result: row.result,
      pointerEvents: row.pointerEvents,
      durationMs: row.chaseDurationMs,
      evadeCount: row.evadeCount,
      surrendered: row.surrendered,
    }
    // Extract behavioral features from chase path
    if (row.chasePath && Array.isArray(row.chasePath)) {
      const path = row.chasePath
      entry.pathLength = path.length
      if (path.length >= 2) {
        // Average speed (pixels per ms)
        let totalDist = 0
        for (let i = 1; i < path.length; i++) {
          const dx = (path[i].x || 0) - (path[i-1].x || 0)
          const dy = (path[i].y || 0) - (path[i-1].y || 0)
          totalDist += Math.sqrt(dx*dx + dy*dy)
        }
        const totalTime = (path[path.length-1].t || 0) - (path[0].t || 0)
        entry.avgSpeed = totalTime > 0 ? totalDist / totalTime : 0
        // Direction changes (hesitation measure)
        let dirChanges = 0
        for (let i = 2; i < path.length; i++) {
          const dx1 = (path[i-1].x || 0) - (path[i-2].x || 0)
          const dy1 = (path[i-1].y || 0) - (path[i-2].y || 0)
          const dx2 = (path[i].x || 0) - (path[i-1].x || 0)
          const dy2 = (path[i].y || 0) - (path[i-1].y || 0)
          const cross = dx1 * dy2 - dy1 * dx2
          if (Math.abs(cross) > 5) dirChanges++
        }
        entry.directionChanges = dirChanges
        entry.hesitationRate = path.length > 2 ? dirChanges / (path.length - 2) : 0
      }
    }
    corpus.behavioral.push(entry)
  }
  console.log(`  Chase telemetry: ${challenges.rows.length} sessions`)

  // Deduplicate phrases
  const seen = new Set()
  corpus.phrases = corpus.phrases.filter(p => {
    if (seen.has(p.text)) return false
    seen.add(p.text)
    return true
  })

  console.log(`\nTotal: ${corpus.phrases.length} unique phrases, ${corpus.behavioral.length} behavioral entries`)

  writeFileSync(CORPUS_FILE, JSON.stringify(corpus, null, 2))
  console.log(`Written to ${CORPUS_FILE}`)

  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
