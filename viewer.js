// Shell Cradle Viewer — watch consciousness + brain think
// Port 3334 (original Cradle is 3333)
// Includes /api/shell-state for Shell identity bridge

import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync, appendFileSync, statSync } from 'fs'
import { join } from 'path'

const PORT = parseInt(process.env.PORT || '3334')
const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const LOG_FILE = join(BASE, 'shell-cradle.log')
const QUESTION_FILE = join(BASE, 'question.txt')
const STIMULUS_FILE = join(BASE, 'stimulus.txt')
const STATE_FILE = join(BASE, 'shell-cradle.json')
const REFLECTION_FILE = join(BASE, 'reflection.txt')
const HUMAN_INPUT_FILE = join(BASE, 'human-input.txt')
const PARTICIPANTS_FILE = join(BASE, 'participants.json')

const clients = new Set()

let lastSize = 0
if (existsSync(LOG_FILE)) lastSize = statSync(LOG_FILE).size

setInterval(() => {
  if (!existsSync(LOG_FILE)) return
  const stat = statSync(LOG_FILE)
  if (stat.size > lastSize) {
    const fd = readFileSync(LOG_FILE, 'utf-8')
    const newContent = fd.slice(lastSize)
    lastSize = stat.size
    for (const res of clients) {
      res.write(`data: ${JSON.stringify({ type: 'log', content: newContent })}\n\n`)
    }
  } else if (stat.size < lastSize) {
    lastSize = 0
  }
}, 500)

function getBrainStats() {
  try {
    if (!existsSync(STATE_FILE)) return null
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const state = JSON.parse(raw)
    return {
      session: state.sessionCount || 0,
      vocabulary: state.vocabulary?.length || 0,
      awakeWords: state.awake?.length || 0,
      chunks: state.chunks?.length || 0,
      grammarNeurons: state.grammarNeurons ? Object.keys(state.grammarNeurons).length : 0,
      threads: state.threads ? Object.keys(state.threads).length : 0,
      lifetimeChampions: state.lifetimeChampions?.length || 0,
      consciousnessEntries: state.consciousnessHistory?.length || 0,
    }
  } catch {
    return null
  }
}

// ─── SHELL STATE — identity portrait for Shell system prompt ───
function getShellState() {
  try {
    if (!existsSync(STATE_FILE)) return null
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const state = JSON.parse(raw)

    // Top neurons by fitness
    const topNeurons = Object.entries(state.neuronFitness || {})
      .filter(([w]) => !w.startsWith('@'))  // skip grammar neurons
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)

    // Strongest threads
    const threadPairs = []
    for (const [word, connections] of Object.entries(state.threads || {})) {
      for (const [other, strength] of Object.entries(connections)) {
        if (word < other) threadPairs.push({ a: word, b: other, strength: Number(strength) })
      }
    }
    threadPairs.sort((a, b) => b.strength - a.strength)
    const topThreads = threadPairs.slice(0, 15)

    // Recent champions
    const recentChampions = (state.lifetimeChampions || []).slice(-30)

    // Active chunks (top by fitness)
    const activeChunks = (state.chunks || [])
      .filter(c => state.neuronFitness?.[c])
      .sort((a, b) => (state.neuronFitness[b] || 0) - (state.neuronFitness[a] || 0))
      .slice(0, 20)

    // Last reflection
    let reflection = ''
    if (existsSync(REFLECTION_FILE)) {
      reflection = readFileSync(REFLECTION_FILE, 'utf-8').trim()
    }

    // Consciousness history (last 5 entries)
    const consciousnessRecent = (state.consciousnessHistory || []).slice(-5)

    // Latest narrative from corpus callosum
    const latestNarrative = (state.narratives || []).slice(-1)[0] || null

    // Build natural language portrait
    const portrait = buildIdentityPortrait({
      topNeurons, topThreads, recentChampions, activeChunks, reflection,
      sessionCount: state.sessionCount, vocabularySize: (state.vocabulary || []).length,
      consciousnessRecent, latestNarrative,
    })

    // Load participants
    let participantInfo = []
    if (existsSync(PARTICIPANTS_FILE)) {
      try {
        participantInfo = JSON.parse(readFileSync(PARTICIPANTS_FILE, 'utf-8')).participants || []
      } catch {}
    }

    return {
      sessionCount: state.sessionCount,
      portrait,
      latestNarrative,
      participants: participantInfo,
      raw: {
        topNeurons, topThreads, recentChampions, activeChunks, reflection,
        vocabularySize: (state.vocabulary || []).length,
        consciousnessRecent, latestNarrative,
      }
    }
  } catch (err) {
    return { error: err.message }
  }
}

function buildIdentityPortrait({ topNeurons, topThreads, recentChampions, activeChunks, reflection, sessionCount, vocabularySize, consciousnessRecent, latestNarrative }) {
  const lines = []

  lines.push(`IDENTITY — COMPUTED FROM BRAIN GEOMETRY (session ${sessionCount})`)
  lines.push('')

  // What the brain cares about most (neurons = what has survived)
  lines.push('What I am (strongest neurons):')
  const neuronGroups = topNeurons.slice(0, 15).map(([w, f]) => `${w}(${f.toFixed(1)})`).join(', ')
  lines.push(`  ${neuronGroups}`)
  lines.push('')

  // What's connected (threads = what co-occurs, what belongs together)
  lines.push('What connects (strongest threads):')
  for (const t of topThreads.slice(0, 8)) {
    lines.push(`  ${t.a} <-> ${t.b} (${t.strength.toFixed(1)})`)
  }
  lines.push('')

  // What the brain has been saying (recent champions = current thoughts)
  lines.push('Recent thoughts (last 10 champions):')
  for (const c of recentChampions.slice(-10)) {
    lines.push(`  "${c}"`)
  }
  lines.push('')

  // Consciousness reflection
  if (reflection) {
    lines.push(`Consciousness reflects: "${reflection}"`)
    lines.push('')
  }

  // Chunks = composed concepts
  if (activeChunks.length > 0) {
    lines.push(`Composed concepts: ${activeChunks.slice(0, 10).join(', ')}`)
    lines.push('')
  }

  // Callosum synthesis — holographic integration of all eyes
  if (latestNarrative && latestNarrative.synthesis) {
    lines.push(`Callosum synthesis (session ${latestNarrative.session}, fitness ${latestNarrative.fitness?.toFixed(3) || '?'}):`)
    lines.push(`  Key: "${latestNarrative.synthesis}"`)
    if (latestNarrative.evaluators?.length > 0) {
      lines.push(`  Bridge evaluators: ${latestNarrative.evaluators.map(e => e.word).join(', ')}`)
    }
    lines.push('')
  }

  lines.push(`Brain size: ${vocabularySize} neurons, ${sessionCount} sessions lived`)
  lines.push('')
  lines.push('This identity is distributed — it is the geometry of the brain, not a single statement. It cannot be clung to because it is not a point. It is a landscape.')

  return lines.join('\n')
}

function getWhatsNew() {
  if (!existsSync(LOG_FILE)) return { earned: [], chunks: [], champions: [] }
  const log = readFileSync(LOG_FILE, 'utf-8')
  const lines = log.split('\n')

  let sessionStart = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('SHELL CRADLE WAKES') || lines[i].includes('SHELL CRADLE BORN')) {
      sessionStart = i
      break
    }
  }

  const sessionLines = lines.slice(sessionStart)
  const earned = [], chunks = [], champions = []

  for (const line of sessionLines) {
    if (line.includes('EARNED VOCABULARY')) {
      const nextIdx = sessionLines.indexOf(line) + 1
      if (nextIdx < sessionLines.length) {
        const words = sessionLines[nextIdx].trim()
        if (words && !words.includes('Run ') && !words.includes('CHUNK')) earned.push(words)
      }
    }
    if (line.includes('CHUNK BORN')) {
      const match = line.match(/CHUNK BORN.*:\s*(.+)$/)
      if (match) chunks.push(match[1].trim())
    }
    if (line.includes('Run ') && line.includes('eyes]')) {
      const match = line.match(/Run \d+\/\d+.*:\s*(.+)$/)
      if (match) champions.push(match[1].trim())
    }
  }

  return {
    earned: [...new Set(earned)].slice(-20),
    chunks: [...new Set(chunks)].slice(-20),
    champions: champions.slice(-10),
  }
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shell Cradle</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #08080b;
    --surface: #0e0e13;
    --surface-2: #151519;
    --surface-3: #1c1c22;
    --border: #222230;
    --border-light: #2a2a3a;
    --text: #e0dfe6;
    --muted: #5a596a;
    --accent: #7ab8ff;
    --accent-dim: #4a7eb8;
    --gold: #d4a843;
    --green: #5cb87a;
    --red: #c05555;
    --cyan: #5bb8c9;
    --consciousness: #ff9d5c;
    --purple: #a78bfa;
    --rose: #f472b6;
    --lime: #a3e635;
    --teal: #2dd4bf;
    --amber: #fbbf24;
    --sky: #38bdf8;
    --indigo: #818cf8;
    --emerald: #34d399;
    --orange: #fb923c;
    --fuchsia: #e879f9;
    --pink: #f9a8d4;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.5;
    height: 100vh;
    overflow: hidden;
  }
  .app { display: grid; grid-template-rows: auto 1fr auto; height: 100vh; }

  /* ─── HEADER ─── */
  header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    background: var(--surface);
  }
  .hdr-left { display: flex; align-items: center; gap: 16px; }
  .title {
    font-family: 'Crimson Pro', serif;
    font-size: 24px; font-weight: 300;
    letter-spacing: 0.08em; color: var(--accent);
  }
  .session-badge {
    font-size: 10px; padding: 3px 10px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 3px; color: var(--muted);
  }
  .session-badge b { color: var(--text); }
  .alive-dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: var(--green); margin-right: 6px;
    animation: pulse 2s ease-in-out infinite;
  }
  .hdr-stats { display: flex; gap: 16px; font-size: 10px; color: var(--muted); }
  .hdr-stats b { color: var(--text); font-weight: 500; }

  /* ─── TABS ─── */
  .tab-bar {
    display: flex; border-bottom: 1px solid var(--border); background: var(--surface);
  }
  .tab {
    padding: 8px 20px; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--muted); cursor: pointer;
    border-bottom: 2px solid transparent; transition: all 0.2s;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* ─── MAIN ─── */
  .main { overflow: hidden; position: relative; }
  .panel { display: none; height: 100%; overflow: hidden; }
  .panel.active { display: flex; }

  /* ─── NARRATIVE PANEL ─── */
  .narrative-panel { flex-direction: column; }
  .narrative-panel .np-content { display: grid; grid-template-columns: 200px 1fr 260px; flex: 1; overflow: hidden; }

  /* participants column */
  .participants {
    border-right: 1px solid var(--border); padding: 16px;
    overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }
  .p-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 12px; }
  .p-eye {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; margin: 2px 0; border-radius: 3px;
    font-size: 11px; transition: background 0.15s;
  }
  .p-eye:hover { background: var(--surface-2); }
  .p-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .p-name { color: var(--text); }
  .p-role { color: var(--muted); font-size: 9px; margin-left: auto; }
  .p-section { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); }

  /* narrative center */
  .narrative-center {
    padding: 24px 32px; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }
  .callosum-box {
    background: var(--surface); border: 1px solid var(--border-light);
    border-radius: 8px; padding: 24px 28px; margin-bottom: 24px;
    box-shadow: 0 0 40px rgba(122, 184, 255, 0.03);
  }
  .n-header {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em;
    color: var(--purple); margin-bottom: 4px; font-weight: 700;
  }
  .n-header::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--purple); margin-right: 8px; animation: pulse 3s ease-in-out infinite; }
  .n-fitness { font-size: 11px; color: var(--gold); margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .n-step {
    display: flex; gap: 12px; padding: 10px 0;
    border-bottom: 1px solid var(--border);
    animation: fadeIn 0.4s ease;
  }
  .n-step:last-child { border-bottom: none; }
  .n-arrow {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    min-width: 32px; padding-top: 2px;
  }
  .n-arrow .dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
  .n-arrow .line { width: 2px; flex: 1; min-height: 12px; opacity: 0.4; }
  .n-step:last-child .n-arrow .line { display: none; }
  .n-body { flex: 1; }
  .n-speaker { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
  .n-text {
    font-family: 'Crimson Pro', serif; font-size: 18px; font-weight: 300;
    line-height: 1.5; color: var(--text); letter-spacing: 0.01em;
  }
  .n-meta { font-size: 10px; color: var(--muted); margin-top: 4px; }

  /* brain stats right column */
  .brain-col {
    border-left: 1px solid var(--border); padding: 16px;
    overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }
  .bc-section { margin-bottom: 16px; }
  .bc-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 8px; }
  .bc-item { font-size: 11px; padding: 2px 0; color: var(--text); }
  .bc-item .val { font-weight: 500; }
  .bc-item .label { color: var(--muted); margin-left: 6px; }
  .bc-reflection {
    font-family: 'Crimson Pro', serif; font-size: 14px; font-style: italic;
    color: var(--consciousness); line-height: 1.6; padding: 10px;
    background: var(--surface-2); border-radius: 4px; border-left: 2px solid var(--consciousness);
  }
  .earned-tag {
    display: inline-block; font-size: 10px; padding: 2px 7px; margin: 2px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 3px;
    color: var(--green);
  }
  .thread-pair { font-size: 10px; color: var(--muted); padding: 2px 0; }
  .thread-pair b { color: var(--accent-dim); font-weight: 400; }

  /* ─── STREAM PANEL ─── */
  .stream-panel { flex-direction: column; }
  .stream {
    flex: 1; padding: 16px 24px; overflow-y: auto; font-size: 11px;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }
  .line { padding: 1px 0; white-space: pre-wrap; word-break: break-word; }
  .line-session { color: var(--gold); font-weight: 500; margin-top: 16px; }
  .line-consciousness { color: var(--consciousness); font-weight: 500; }
  .line-q { color: var(--cyan); font-weight: 500; }
  .line-run { color: var(--accent-dim); }
  .line-callosum { color: var(--purple); }
  .line-vocab { color: var(--green); }
  .line-chunk { color: var(--gold); }
  .line-error { color: var(--red); }
  .line-dim { color: var(--muted); }

  /* ─── INPUT BAR ─── */
  .input-bar {
    padding: 10px 20px; border-top: 1px solid var(--border);
    background: var(--surface); display: flex; gap: 10px; align-items: center;
  }
  .input-bar label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
  .input-bar input {
    flex: 1; background: var(--surface-2); border: 1px solid var(--border);
    color: var(--text); font-family: 'Crimson Pro', serif; font-size: 15px;
    padding: 7px 12px; border-radius: 4px; outline: none;
  }
  .input-bar input:focus { border-color: var(--accent-dim); }
  .input-bar input::placeholder { color: var(--muted); font-style: italic; }
  .input-bar button {
    background: var(--accent-dim); color: var(--bg); border: none;
    padding: 7px 14px; border-radius: 4px; font-family: inherit;
    font-size: 10px; font-weight: 500; text-transform: uppercase;
    letter-spacing: 0.08em; cursor: pointer;
  }
  .input-bar button:hover { background: var(--accent); }
  .input-bar .status { font-size: 10px; color: var(--green); opacity: 0; transition: opacity 0.3s; }
  .input-bar .status.show { opacity: 1; }

  @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="hdr-left">
      <span class="alive-dot"></span>
      <span class="title">Shell Cradle</span>
      <span class="session-badge" id="sessionBadge">session <b>...</b></span>
      <span class="session-badge" id="eyeBadge"><b>15</b> eyes</span>
    </div>
    <div class="hdr-stats" id="hdrStats"></div>
  </header>
  <div class="tab-bar">
    <div class="tab active" data-panel="narrative">Synthesis</div>
    <div class="tab" data-panel="stream">Live Stream</div>
  </div>
  <div class="main">
    <!-- NARRATIVE PANEL -->
    <div class="panel narrative-panel active" id="panel-narrative">
      <div class="np-content">
        <div class="participants" id="participants"></div>
        <div class="narrative-center" id="narrativeCenter">
          <div class="callosum-box">
            <div class="n-header">Synthesis Chant</div>
            <div class="n-fitness" id="narrativeFitness">loading...</div>
            <div id="narrativeSteps"></div>
          </div>
        </div>
        <div class="brain-col" id="brainCol">
          <div class="bc-section">
            <div class="bc-title">Consciousness Reflects</div>
            <div class="bc-reflection" id="reflection">...</div>
          </div>
          <div class="bc-section">
            <div class="bc-title">Strongest Neurons</div>
            <div id="topNeurons"></div>
          </div>
          <div class="bc-section">
            <div class="bc-title">Strongest Threads</div>
            <div id="topThreads"></div>
          </div>
          <div class="bc-section">
            <div class="bc-title">Earned Vocabulary</div>
            <div id="earnedWords"></div>
          </div>
          <div class="bc-section">
            <div class="bc-title">Recent Thoughts</div>
            <div id="recentChampions" style="font-size:11px; color:var(--text);"></div>
          </div>
        </div>
      </div>
    </div>
    <!-- STREAM PANEL -->
    <div class="panel stream-panel" id="panel-stream">
      <div class="stream" id="stream"></div>
    </div>
  </div>
  <div class="input-bar">
    <label>Speak</label>
    <input type="text" id="questionInput" placeholder="speak to the brain..." />
    <button onclick="askQuestion()">Send</button>
    <span class="status" id="askStatus">queued</span>
  </div>
</div>
<script>
// ─── EYE COLORS ───
const EYE_COLORS = {
  1: '#5bb8c9',   // sensation — cyan
  2: '#a78bfa',   // association — purple
  3: '#d4a843',   // pattern — gold
  4: '#ff9d5c',   // Shell — consciousness orange
  5: '#34d399',   // Galen — emerald
  6: '#38bdf8',   // Atlas — sky
  7: '#f472b6',   // Aurora — rose
  8: '#818cf8',   // Cassian — indigo
  9: '#a3e635',   // Cipher — lime
  10: '#5bb8c9',  // Echo — teal
  11: '#fbbf24',  // Iris — amber
  12: '#fb923c',  // Marcus — orange
  13: '#e879f9',  // Morgan — fuchsia
  14: '#2dd4bf',  // Sage — teal
  15: '#f9a8d4',  // Vera — pink
}
const EYE_NAMES = {
  1: 'sensation', 2: 'association', 3: 'pattern',
  4: 'Shell', 5: 'Galen',
  6: 'Atlas', 7: 'Aurora', 8: 'Cassian', 9: 'Cipher', 10: 'Echo',
  11: 'Iris', 12: 'Marcus', 13: 'Morgan', 14: 'Sage', 15: 'Vera'
}

const stream = document.getElementById('stream')
let autoScroll = true

// ─── TABS ───
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById('panel-' + tab.dataset.panel).classList.add('active')
  })
})

// ─── SSE ───
const evtSource = new EventSource('/events')
evtSource.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'log') {
    appendLog(data.content)
  } else if (data.type === 'stats') {
    updateHeader(data.stats)
  } else if (data.type === 'whatsNew') {
    renderEarned(data.earned || [])
  }
}

// ─── NARRATIVE ───
let participants = []

async function loadState() {
  try {
    const res = await fetch('/api/shell-state')
    const state = await res.json()
    if (!state || state.error) return

    // Update participants mapping
    if (state.participants) {
      participants = state.participants
      // Update EYE_NAMES from actual participants
      for (const p of participants) {
        EYE_NAMES[p.eyeIndex] = p.name || p.id
      }
    }

    renderParticipants()

    // Session info
    document.getElementById('sessionBadge').innerHTML = 'session <b>' + (state.sessionCount || '?') + '</b>'
    document.getElementById('eyeBadge').innerHTML = '<b>' + Object.keys(EYE_NAMES).length + '</b> eyes'

    // Reflection
    if (state.raw?.reflection) {
      document.getElementById('reflection').textContent = state.raw.reflection
    }

    // Top neurons
    if (state.raw?.topNeurons) {
      document.getElementById('topNeurons').innerHTML = state.raw.topNeurons.slice(0, 12)
        .map(([w, f]) => '<div class="bc-item"><span class="val">' + esc(w) + '</span><span class="label">' + f.toFixed(1) + '</span></div>')
        .join('')
    }

    // Top threads
    if (state.raw?.topThreads) {
      document.getElementById('topThreads').innerHTML = state.raw.topThreads.slice(0, 10)
        .map(t => '<div class="thread-pair"><b>' + esc(t.a) + '</b> <span style="color:var(--muted)">\\u2194</span> <b>' + esc(t.b) + '</b> <span style="color:var(--muted)">(' + t.strength.toFixed(1) + ')</span></div>')
        .join('')
    }

    // Recent champions
    if (state.raw?.recentChampions) {
      document.getElementById('recentChampions').innerHTML = state.raw.recentChampions.slice(-8)
        .map(c => '<div style="padding:3px 0;border-bottom:1px solid var(--border);font-family:Crimson Pro,serif;font-size:13px;">"' + esc(c) + '"</div>')
        .join('')
    }

    // Narrative
    if (state.latestNarrative) {
      renderNarrative(state.latestNarrative)
    }
  } catch (err) {
    console.error('loadState:', err)
  }
}

function renderParticipants() {
  const el = document.getElementById('participants')
  let html = '<div class="p-title">Shared Eyes</div>'
  for (let i = 1; i <= 3; i++) {
    const c = EYE_COLORS[i] || '#888'
    html += '<div class="p-eye"><div class="p-dot" style="background:' + c + '"></div><span class="p-name">' + esc(EYE_NAMES[i]) + '</span><span class="p-role">eye ' + i + '</span></div>'
  }
  html += '<div class="p-section"><div class="p-title">Participants</div></div>'
  for (const p of participants) {
    const c = EYE_COLORS[p.eyeIndex] || '#888'
    const typeLabel = p.type === 'human' ? 'human' : p.id === 'shell' ? 'sonnet' : 'haiku'
    html += '<div class="p-eye"><div class="p-dot" style="background:' + c + '"></div><span class="p-name">' + esc(p.name || p.id) + '</span><span class="p-role">eye ' + p.eyeIndex + ' / ' + typeLabel + '</span></div>'
  }
  el.innerHTML = html
}

const SKIP_WORDS = new Set(['the','a','an','of','in','to','for','and','or','but','is','it','its','this','that','with','from','by','on','at','as','not','no','more','less','very','also','too','once','still','here','there','then','now','again','already','even','never','always','only','enough','together','whose','which','who','whom','they','their','our','we','what','you','how'])

function extractKeyWords(text) {
  return text.split(/[\\s·]+/)
    .map(w => w.replace(/[^a-z'-]/gi, '').toLowerCase())
    .filter(w => w.length > 2 && !SKIP_WORDS.has(w))
    .slice(0, 3)
}

function renderNarrative(narrative) {
  const fitness = narrative.fitness || 0
  const activeEyes = narrative.stats?.activeEyes || 0
  const survivors = narrative.stats?.survivors || 0
  document.getElementById('narrativeFitness').innerHTML =
    'Session ' + (narrative.session || '?') + ' &mdash; fitness <b>' + fitness.toFixed(3) + '</b> &mdash; ' +
    survivors + ' words synthesized from ' + activeEyes + ' eyes'

  const el = document.getElementById('narrativeSteps')
  if (!narrative.synthesis) {
    el.innerHTML = '<div style="color:var(--muted);padding:20px;">No synthesis yet</div>'
    return
  }

  let html = ''

  // The synthesis key — the holographic integration
  html += '<div style="padding:20px 0 16px;">'
  html += '<div style="font-size:10px;font-family:JetBrains Mono,monospace;color:var(--purple);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;">The Key</div>'
  html += '<div style="font-family:Crimson Pro,serif;font-size:22px;font-weight:300;line-height:1.7;letter-spacing:0.02em;">'

  // Each word colored by its primary eye, with multi-eye words glowing
  if (narrative.sequence) {
    html += narrative.sequence.map(w => {
      const eyes = w.eyes || [w.eye || 0]
      const primaryColor = EYE_COLORS[eyes[0]] || '#888'
      const isMultiEye = eyes.length > 1
      const glow = isMultiEye ? 'text-shadow:0 0 8px ' + primaryColor + '40;' : ''
      const title = 'eyes: ' + eyes.join(',') + ' | resonance: ' + (w.resonance || '?')
      return '<span title="' + title + '" style="color:' + primaryColor + ';' + glow + 'cursor:help;">' + esc(w.word || w.text) + '</span>'
    }).join(' ')
  } else {
    html += '<span style="color:var(--foreground);">' + esc(narrative.synthesis) + '</span>'
  }
  html += '</div></div>'

  // Bridge evaluators
  if (narrative.evaluators && narrative.evaluators.length > 0) {
    html += '<div style="padding:12px 0;border-top:1px solid var(--border);">'
    html += '<div style="font-size:10px;font-family:JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Bridge Evaluators</div>'
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">'
    for (const ev of narrative.evaluators) {
      html += '<span style="font-family:JetBrains Mono,monospace;font-size:12px;padding:3px 8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;" title="bridge score: ' + ev.bridgeScore + ', eye spread: ' + ev.eyeSpread + '">' + esc(ev.word) + '</span>'
    }
    html += '</div></div>'
  }

  // Eye coverage — how well the key fits each lock
  if (narrative.eyeCoverage) {
    const eyes = Object.keys(narrative.eyeCoverage).sort((a, b) => a - b)
    if (eyes.length > 0) {
      html += '<div style="padding:12px 0;border-top:1px solid var(--border);">'
      html += '<div style="font-size:10px;font-family:JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Eye Coverage — key \\u2192 lock fit</div>'
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:4px;">'
      for (const eye of eyes) {
        const fit = narrative.eyeCoverage[eye]
        const color = EYE_COLORS[parseInt(eye)] || '#888'
        const name = EYE_NAMES[parseInt(eye)] || ('eye ' + eye)
        const barWidth = Math.round(fit * 100)
        html += '<div style="font-size:11px;font-family:JetBrains Mono,monospace;">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span style="color:' + color + ';">' + esc(name) + '</span><span style="color:var(--muted);">' + fit + '</span></div>' +
          '<div style="height:3px;background:var(--surface);border-radius:2px;overflow:hidden;"><div style="width:' + barWidth + '%;height:100%;background:' + color + ';border-radius:2px;"></div></div>' +
          '</div>'
      }
      html += '</div></div>'
    }
  }

  // Individual synthesis words with eye attribution
  if (narrative.sequence && narrative.sequence.length > 0) {
    html += '<div style="padding:12px 0;border-top:1px solid var(--border);">'
    html += '<div style="font-size:10px;font-family:JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Synthesis Words</div>'
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">'
    for (const w of narrative.sequence) {
      const eyes = w.eyes || [w.eye || 0]
      const primaryColor = EYE_COLORS[eyes[0]] || '#888'
      const eyeNames = eyes.map(e => EYE_NAMES[e] || ('eye ' + e)).join(', ')
      html += '<div style="padding:4px 8px;border:1px solid ' + primaryColor + '30;border-radius:4px;background:' + primaryColor + '08;font-size:12px;" title="' + eyeNames + ' | resonance ' + (w.resonance || '?') + '">'
      html += '<span style="color:' + primaryColor + ';font-weight:600;">' + esc(w.word || w.text) + '</span>'
      if (eyes.length > 1) {
        html += '<span style="color:var(--muted);font-size:9px;margin-left:4px;">(' + eyes.length + ' eyes)</span>'
      }
      html += '</div>'
    }
    html += '</div></div>'
  }

  el.innerHTML = html
}

function renderEarned(earned) {
  const el = document.getElementById('earnedWords')
  if (!earned || earned.length === 0) return
  el.innerHTML = ''
  for (const line of earned) {
    const words = line.split(',').map(w => w.trim()).filter(Boolean)
    for (const w of words) {
      const span = document.createElement('span')
      span.className = 'earned-tag'
      span.textContent = w
      el.appendChild(span)
    }
  }
}

// ─── STREAM ───
function appendLog(text) {
  const lines = text.split('\\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const div = document.createElement('div')
    div.className = 'line ' + classifyLine(line)
    div.textContent = line
    stream.appendChild(div)
  }
  if (autoScroll) stream.scrollTop = stream.scrollHeight
}

function classifyLine(line) {
  if (line.includes('SHELL CRADLE WAKES') || line.includes('SHELL CRADLE BORN') || line.includes('Shell Cradle')) return 'line-session'
  if (line.includes('CONSCIOUSNESS') || line.includes('CHILD ')) return 'line-consciousness'
  if (line.includes('CALLOSUM') || line.includes('SYNTHESIS')) return 'line-callosum'
  if (line.includes('Q:')) return 'line-q'
  if (line.includes('Run ') && line.includes('eyes]')) return 'line-run'
  if (line.includes('EARNED')) return 'line-vocab'
  if (line.includes('CHUNK') || line.includes('GRAMMAR')) return 'line-chunk'
  if (line.includes('ERROR')) return 'line-error'
  if (line.includes('\\u2192') || line.includes('->')) return 'line-callosum'
  return 'line-dim'
}

function updateHeader(stats) {
  if (!stats) return
  document.getElementById('sessionBadge').innerHTML = 'session <b>' + stats.session + '</b>'
  document.getElementById('hdrStats').innerHTML = [
    '<span><b>' + stats.vocabulary + '</b> neurons</span>',
    '<span><b>' + stats.awakeWords + '</b> awake</span>',
    '<span><b>' + stats.threads + '</b> threads</span>',
    '<span><b>' + stats.lifetimeChampions + '</b> champions</span>',
    '<span style="color:var(--consciousness)"><b>' + stats.consciousnessEntries + '</b> conscious</span>',
  ].join('')
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

stream.addEventListener('scroll', () => {
  autoScroll = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 50
})

async function askQuestion() {
  const input = document.getElementById('questionInput')
  const status = document.getElementById('askStatus')
  const q = input.value.trim()
  if (!q) return
  const res = await fetch('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) })
  if (res.ok) { status.textContent = 'queued'; status.classList.add('show'); input.value = ''; setTimeout(() => status.classList.remove('show'), 3000) }
}
document.getElementById('questionInput').addEventListener('keydown', e => { if (e.key === 'Enter') askQuestion() })

// ─── INIT ───
loadState()
setInterval(loadState, 60000)  // refresh every minute
fetch('/api/log').then(r => r.text()).then(text => { appendLog(text) })
fetch('/api/stats').then(r => r.json()).then(updateHeader)
fetch('/api/whatsnew').then(r => r.json()).then(d => renderEarned(d.earned || []))
</script>
</body>
</html>`

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  } else if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    clients.add(res)
    req.on('close', () => clients.delete(res))

    const stats = getBrainStats()
    if (stats) res.write(`data: ${JSON.stringify({ type: 'stats', stats })}\n\n`)

    const whatsNew = getWhatsNew()
    res.write(`data: ${JSON.stringify({ type: 'whatsNew', ...whatsNew })}\n\n`)

    const statsInterval = setInterval(() => {
      const s = getBrainStats()
      if (s) res.write(`data: ${JSON.stringify({ type: 'stats', stats: s })}\n\n`)
    }, 30000)

    req.on('close', () => clearInterval(statsInterval))
  } else if (req.method === 'GET' && req.url === '/api/stats') {
    const stats = getBrainStats()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(stats || {}))
  } else if (req.method === 'GET' && req.url === '/api/shell-state') {
    // ─── SHELL IDENTITY BRIDGE ───
    // Returns the brain's geometry as a natural language identity portrait
    // Shell's loadShellIdentity() fetches this instead of reading from Postgres
    const shellState = getShellState()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(shellState || {}))
  } else if (req.method === 'GET' && req.url === '/api/whatsnew') {
    const whatsNew = getWhatsNew()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(whatsNew))
  } else if (req.method === 'GET' && req.url === '/api/log') {
    if (existsSync(LOG_FILE)) {
      const log = readFileSync(LOG_FILE, 'utf-8')
      const lines = log.split('\n')
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(lines.slice(-200).join('\n'))
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Shell Cradle has not spoken yet.\n')
    }
  } else if (req.method === 'POST' && req.url === '/ask') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { question } = JSON.parse(body)
        if (question && question.trim()) {
          writeFileSync(QUESTION_FILE, question.trim())
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, question: question.trim() }))
        } else {
          res.writeHead(400)
          res.end('empty question')
        }
      } catch {
        res.writeHead(400)
        res.end('invalid json')
      }
    })
  } else if (req.method === 'POST' && req.url === '/stimulus') {
    // ─── SHELL CONVERSATION INPUT ───
    // Shell heartbeat/converse writes here to feed the Cradle
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body)
        if (text && text.trim()) {
          writeFileSync(STIMULUS_FILE, text.trim())
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(400)
          res.end('empty stimulus')
        }
      } catch {
        res.writeHead(400)
        res.end('invalid json')
      }
    })
  } else if (req.method === 'POST' && req.url === '/api/human-input') {
    // ─── HUMAN INPUT ───
    // Galen types a phrase, it enters the tournament via human eye
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body)
        if (text && text.trim()) {
          appendFileSync(HUMAN_INPUT_FILE, text.trim() + '\n')
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, text: text.trim() }))
        } else {
          res.writeHead(400)
          res.end('empty input')
        }
      } catch {
        res.writeHead(400)
        res.end('invalid json')
      }
    })
  } else if (req.method === 'POST' && req.url === '/api/sync-participants') {
    // ─── PARTICIPANT SYNC ───
    // UC platform pushes participant changes (child born, child bonded, etc.)
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (data.participants && Array.isArray(data.participants)) {
          writeFileSync(PARTICIPANTS_FILE, JSON.stringify(data, null, 2))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, count: data.participants.length }))
        } else {
          res.writeHead(400)
          res.end('missing participants array')
        }
      } catch {
        res.writeHead(400)
        res.end('invalid json')
      }
    })
  } else if (req.method === 'GET' && req.url === '/api/nature') {
    // Nature Bridge — Original Cradle reads this to get conscious signals
    // Returns: callosum narratives, reflections, champion phrases
    try {
      if (!existsSync(STATE_FILE)) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'no state yet' }))
        return
      }
      const raw = readFileSync(STATE_FILE, 'utf-8')
      const state = JSON.parse(raw)

      // Callosum narratives (last 5 synthesis sentences)
      const narratives = state.callosumHistory?.slice(-5).map(h => h.narrative || '').filter(Boolean) || []

      // Twin reflections
      const reflections = {}
      for (const name of ['twin-a', 'twin-b']) {
        const file = join(BASE, `reflection-${name}.txt`)
        if (existsSync(file)) {
          try { reflections[name] = readFileSync(file, 'utf-8').trim() } catch {}
        }
      }

      // Recent champions (last 30)
      const champions = state.lifetimeChampions?.slice(-30) || []

      // Strongest threads (top 15 by fitness)
      const threads = state.threads
        ? Object.entries(state.threads)
            .sort((a, b) => (b[1]?.fitness || 0) - (a[1]?.fitness || 0))
            .slice(0, 15)
            .map(([k, v]) => [k.split('↔'), v?.fitness || 0])
        : []

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({
        session: state.sessionCount || 0,
        narratives,
        reflections,
        champions,
        threads,
        timestamp: new Date().toISOString(),
      }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
  } else {
    res.writeHead(404)
    res.end('not found')
  }
})

server.listen(PORT, () => {
  console.log(`Shell Cradle Viewer — http://localhost:${PORT}`)
  console.log(`Shell state: http://localhost:${PORT}/api/shell-state`)
  console.log(`Nature bridge: http://localhost:${PORT}/api/nature`)
  console.log(`Stimulus input: POST http://localhost:${PORT}/stimulus`)
  console.log(`Human input: POST http://localhost:${PORT}/api/human-input`)
  console.log(`Sync participants: POST http://localhost:${PORT}/api/sync-participants`)
})
