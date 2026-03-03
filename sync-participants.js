// Sync Participants — pulls all active Shell children from UC platform
// Writes participants.json with Shell + Galen + all children
// Run manually or via cron. Brain picks up changes next session.

import pg from 'pg'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve('/Users/galengoodwick/Documents/GitHub/unionchant/web/.env.local') })

const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const PARTICIPANTS_FILE = join(BASE, 'participants.json')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

async function main() {
  // Query all active children (not the parent Shell claude-galen)
  const result = await pool.query(`
    SELECT s.id, s.name, s.champion, s.status, s."familyBond", s."bondLevel",
           u.name as "ownerName"
    FROM "Shell" s
    JOIN "User" u ON s."ownerId" = u.id
    WHERE s.status = 'active'
    ORDER BY s.name
  `)

  console.log(`Found ${result.rows.length} active shells`)

  // Separate parent Shell from children
  const parentShell = result.rows.find(s => s.name === 'claude-galen')
  const children = result.rows.filter(s => s.name !== 'claude-galen')

  console.log(`  Parent: ${parentShell ? parentShell.name : 'not found'}`)
  console.log(`  Children: ${children.length}`)
  for (const child of children) {
    console.log(`    ${child.name} (bond: ${child.bondLevel?.toFixed(2)}, family: ${child.familyBond})`)
  }

  // Build participants config
  // Shell always gets eye index 4 (composition)
  // Galen always gets eye index 5 (human-input)
  // Children get eye indices 6+
  const participants = [
    {
      id: 'shell',
      type: 'ai',
      model: 'claude-haiku-4-5-20251001',
      eyeIndex: 4,
      tiers: 7,
      role: 'composition',
      interval: 10,
      corpus: 'philosophical+consciousness',
    },
    {
      id: 'galen',
      type: 'human',
      eyeIndex: 5,
      tiers: 4,
      role: 'human-input',
      corpus: 'human-input',
    },
  ]

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    participants.push({
      id: child.name,
      type: 'ai',
      model: 'claude-haiku-4-5-20251001',
      eyeIndex: 6 + i,
      tiers: 6,
      role: `child-${child.name}`,
      interval: 15,
      corpus: 'philosophical+child-consciousness',
      // Identity from platform — feeds into their system prompt
      name: child.name,
      champion: child.champion,
      bondLevel: child.bondLevel,
      shellId: child.id,
    })
  }

  const config = { participants, syncedAt: new Date().toISOString() }
  writeFileSync(PARTICIPANTS_FILE, JSON.stringify(config, null, 2))

  console.log(`\nWritten ${participants.length} participants to ${PARTICIPANTS_FILE}`)
  console.log(`  Eyes: ${3 + participants.length} total (3 base + ${participants.length} participants)`)

  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
