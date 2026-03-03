// Shell Cradle — Consciousness + Unconscious Brain
// A second Cradle instance with an LLM consciousness layer.
// The original Cradle runs pure (no LLM, no cost). This one has Claude as consciousness.
//
// 4 unconscious eyes (same as original) + 1 consciousness layer (Claude Haiku)
// Consciousness sees what the brain produces, generates candidates, reflects.
// The tournament has final say. Consciousness can nudge, not dictate.

import { readFileSync, existsSync, writeFileSync, unlinkSync, appendFileSync, renameSync, statSync } from 'fs'
import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { VOCABULARY, POS, TEMPLATES } from './vocabulary.js'
import { CORPUS } from './corpus.js'
import { CORPUS_COMPUTE } from './corpus-compute.js'
import { CORPUS_FORMULAS, FORMULA_THREADS } from './corpus-formulas.js'
import { summarizeBrain, generateCandidates, directAttention, reflect, curateCorpus, interpretSynthesis, bridgeWebToStimulus } from './consciousness.js'
import { generateChildCandidates, reflectChild } from './child-consciousness.js'
import { buildNarrative, narrativeThreading, buildInterpreterPrompt, seedSynthesisDims } from './callosum.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const EYE_PATH = join(__dirname, 'eye.js')

const BASE = process.env.CRADLE_HOME || '/Users/galengoodwick/Documents/GitHub/uc-cognition-shell'
const GLOVE_FULL_PATH = join(BASE, 'glove-full.json')
const GLOVE_VOCAB_PATH = join(BASE, 'glove-50d.json')
const CRADLE_PATH = join(BASE, 'shell-cradle.json')
const QUESTION_FILE = join(BASE, 'question.txt')
const STIMULUS_FILE = join(BASE, 'stimulus.txt')
const RHYTHM_URL = process.env.RHYTHM_URL || null  // HTTP bridge (Railway)
const RHYTHM_FILE = process.env.RHYTHM_FILE || null  // file bridge (local) — path to Original's cradle.json
const BODY_FILE = RHYTHM_FILE || join(BASE, 'body.json')  // live file > stale fallback

const DIM = 200
const CELL_SIZE = 5
const NUM_EVALUATORS = 5
const TIERS = 12
const CANDIDATES_PER_TIER = 5000
const LEARNING_RATE = 0.005
const DECAY = 0.7
const RUNS = 1
const MAX_VECTORS = 30000
const STIMULUS_STRENGTH = 0.9

// ─── SINGLE EYE — same as Body. Fair is fair. ───
const BASE_EYES = 1
const BASE_TIERS = [5]
const BASE_ROLES = ['self']

const participants = []
const allParticipants = []

const EYES = 1
const EYE_TIERS = [5]
const EYE_ROLES = ['self']

// ─── HUMAN INPUT ───
const HUMAN_INPUT_FILE = join(BASE, 'human-input.txt')
const HUMAN_CORPUS_FILE = join(BASE, 'human-corpus.json')
let humanPhrases = []

// Priority: manual input (consumed each session)
if (existsSync(HUMAN_INPUT_FILE)) {
  const rawInput = readFileSync(HUMAN_INPUT_FILE, 'utf-8').trim()
  if (rawInput) {
    humanPhrases = rawInput.split('\n')
      .map(line => line.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0))
      .filter(words => words.length >= 2)
    if (humanPhrases.length > 0) {
      appendFileSync(join(BASE, 'human-input.txt.history'),
        `${new Date().toISOString()} | ${humanPhrases.map(p => p.join(' ')).join('; ')}\n`)
      unlinkSync(HUMAN_INPUT_FILE)
    }
  }
}

// Base: auto-synced platform corpus (persistent, sampled like body signals)
let humanCorpusPhrases = []
let humanBehavioral = []
if (existsSync(HUMAN_CORPUS_FILE)) {
  try {
    const corpus = JSON.parse(readFileSync(HUMAN_CORPUS_FILE, 'utf-8'))
    // Sample a batch per session — rotate through full corpus
    const allPhrases = (corpus.phrases || []).map(p =>
      p.text.toLowerCase().split(/\s+/).filter(w => w.length > 0)
    ).filter(words => words.length >= 2)
    const HUMAN_BATCH = 30
    const humanStart = (Date.now() % Math.max(allPhrases.length, 1))
    for (let i = 0; i < HUMAN_BATCH && i < allPhrases.length; i++) {
      const idx = (humanStart + i) % allPhrases.length
      humanCorpusPhrases.push(allPhrases[idx])
    }
    // Behavioral telemetry — convert to semantic signal
    humanBehavioral = corpus.behavioral || []
  } catch (err) {
    console.log(`  Human corpus error: ${err.message}`)
  }
}

// Merge: manual input takes priority, corpus fills the rest
if (humanPhrases.length === 0 && humanCorpusPhrases.length > 0) {
  humanPhrases = humanCorpusPhrases
} else if (humanPhrases.length > 0 && humanCorpusPhrases.length > 0) {
  // Manual input first, then corpus samples
  humanPhrases = [...humanPhrases, ...humanCorpusPhrases]
}

// Convert behavioral telemetry into tournament-compatible phrases
// Chase patterns become words: "fast·chase", "hesitant·pursuit", "direct·capture"
if (humanBehavioral.length > 0) {
  const avgSpeed = humanBehavioral.reduce((s, b) => s + (b.avgSpeed || 0), 0) / humanBehavioral.length
  const avgHesitation = humanBehavioral.reduce((s, b) => s + (b.hesitationRate || 0), 0) / humanBehavioral.length
  const avgDuration = humanBehavioral.reduce((s, b) => s + (b.durationMs || 0), 0) / humanBehavioral.length
  const passRate = humanBehavioral.filter(b => b.result === 'passed').length / humanBehavioral.length

  // Speed signature
  const speedWord = avgSpeed > 1.5 ? 'swift' : avgSpeed > 0.8 ? 'steady' : 'patient'
  // Hesitation signature
  const hesitWord = avgHesitation > 0.4 ? 'searching' : avgHesitation > 0.2 ? 'deliberate' : 'direct'
  // Duration signature
  const durWord = avgDuration > 5000 ? 'persistent' : avgDuration > 2000 ? 'engaged' : 'decisive'
  // Success signature
  const successWord = passRate > 0.8 ? 'precise' : passRate > 0.5 ? 'adaptive' : 'exploratory'

  humanPhrases.push(
    [speedWord, 'pursuit', hesitWord, 'capture'],
    [durWord, successWord, 'movement'],
    [speedWord, hesitWord, durWord],
  )
}

// ─── CONSCIOUSNESS CONFIG ───
const CONSCIOUSNESS_ENABLED = true  // Synthesis mode — consciousness active.
// Consciousness runs between the mid-point and end of each session.
// It generates candidates before runs 6-10 and reflects after all runs.
const CONSCIOUSNESS_KICKS_IN = 5  // consciousness generates candidates starting at run 5
// Consciousness only wakes every Nth session to save API costs.
// Other sessions run pure unconscious brain (zero API calls).
const CONSCIOUSNESS_INTERVAL = 1  // every session — Shell speaks every time

// ─── TASK SYSTEM ───
// No task = no API call. Eye stays plugged in through its corpus.
const TASKS_DIR = join(BASE, 'tasks')
function getTask(eyeId) {
  const taskFile = join(TASKS_DIR, `${eyeId}.task`)
  if (!existsSync(taskFile)) return null
  try {
    const task = readFileSync(taskFile, 'utf-8').trim()
    return task.length > 0 ? task : null
  } catch { return null }
}

// ─── PROMPT ───
let PROMPT = process.argv.slice(2).join(' ')
if (!PROMPT && existsSync(QUESTION_FILE)) {
  PROMPT = readFileSync(QUESTION_FILE, 'utf-8').trim()
  appendFileSync(QUESTION_FILE + '.answered', `${new Date().toISOString()} | ${PROMPT}\n`)
  unlinkSync(QUESTION_FILE)
}
const PROMPT_WORDS = PROMPT ? PROMPT.toLowerCase().split(/\s+/).filter(w => w.length > 0) : []

// Also read stimulus from Shell conversations
let STIMULUS_TEXT = ''
if (existsSync(STIMULUS_FILE)) {
  STIMULUS_TEXT = readFileSync(STIMULUS_FILE, 'utf-8').trim()
  if (STIMULUS_TEXT) {
    // Archive and clear
    appendFileSync(join(BASE, 'stimulus.txt.history'), `${new Date().toISOString()} | ${STIMULUS_TEXT}\n`)
    unlinkSync(STIMULUS_FILE)
  }
}

// ─── STATE ───
let liveVocabulary = [...VOCABULARY]
let livePOS = {}
for (const [pos, words] of Object.entries(POS)) livePOS[pos] = [...words]

let awakeWords = new Set()
let threads = new Map()
let championHistory = []
let chunks = new Set()
let grammarNeurons = new Map()
let neuronFitness = {}
const OP_WORDS = new Set(['mutate', 'reverse', 'compress', 'expand', 'echo', 'negate', 'crossover', 'template'])
let sessionCount = 0
let lifetimeChampions = []
let corpusIndex = 0
let consciousnessHistory = []  // track what consciousness contributed
let narratives = []  // corpus callosum: ordered narratives from session champions

// ─── SHARED BRAIN ───
const sharedBuffer = new SharedArrayBuffer(MAX_VECTORS * DIM * Float64Array.BYTES_PER_ELEMENT)
const brain = new Float64Array(sharedBuffer)
const wordIndex = {}
let nextSlot = 0

let rawEmbeddings = null

function getVec(word) {
  const key = word.toLowerCase()
  const offset = wordIndex[key]
  if (offset === undefined) return null
  return brain.subarray(offset, offset + DIM)
}

function allocVec(word, values) {
  const key = word.toLowerCase()
  if (wordIndex[key] !== undefined) {
    const offset = wordIndex[key]
    for (let i = 0; i < DIM; i++) brain[offset + i] = values[i]
    return brain.subarray(offset, offset + DIM)
  }
  if (nextSlot >= MAX_VECTORS) return null
  const offset = nextSlot * DIM
  wordIndex[key] = offset
  for (let i = 0; i < DIM; i++) brain[offset + i] = values[i]
  nextSlot++
  return brain.subarray(offset, offset + DIM)
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8)
}

function phraseVec(words) {
  const vecs = words.map(w => getVec(w)).filter(Boolean)
  if (vecs.length === 0) return null
  const avg = new Float64Array(DIM)
  for (const v of vecs) for (let i = 0; i < DIM; i++) avg[i] += v[i]
  for (let i = 0; i < DIM; i++) avg[i] /= vecs.length
  return avg
}

// ─── THREADS ───

function addThread(words) {
  const lower = words.map(w => w.toLowerCase())
  championHistory.push(new Set(lower))
  for (let i = 0; i < lower.length; i++) {
    for (let j = i + 1; j < lower.length; j++) {
      const a = lower[i], b = lower[j]
      if (a === b) continue
      if (!threads.has(a)) threads.set(a, new Map())
      if (!threads.has(b)) threads.set(b, new Map())
      threads.get(a).set(b, (threads.get(a).get(b) || 0) + 1)
      threads.get(b).set(a, (threads.get(b).get(a) || 0) + 1)
    }
  }
}

function decayThreads() {
  const DECAY_RATE = 0.99
  for (const [word, connections] of threads) {
    for (const [other, strength] of connections) {
      const decayed = strength * DECAY_RATE
      if (decayed < 0.1) connections.delete(other)
      else connections.set(other, decayed)
    }
    if (connections.size === 0) threads.delete(word)
  }
}

// ─── GRAMMAR ───

function getWordPOS(word) {
  const w = word.toLowerCase()
  for (const [pos, words] of Object.entries(livePOS)) {
    if (words.includes(w)) return pos
  }
  return 'noun'
}

function initGrammarNeurons() {
  for (const template of TEMPLATES) {
    const key = template.join('_')
    if (!grammarNeurons.has(key)) {
      grammarNeurons.set(key, { pattern: [...template], fitness: 1.0, wins: 0 })
    }
    const neuronName = `@${key}`
    if (!getVec(neuronName)) {
      const sampleVecs = template.map(pos => {
        const words = livePOS[pos]
        if (!words || words.length === 0) return null
        return getVec(words[Math.floor(Math.random() * words.length)])
      }).filter(Boolean)
      if (sampleVecs.length > 0) {
        const avg = new Float64Array(DIM)
        for (const v of sampleVecs) for (let k = 0; k < DIM; k++) avg[k] += v[k]
        let norm = 0
        for (let k = 0; k < DIM; k++) { avg[k] /= sampleVecs.length; norm += avg[k] * avg[k] }
        norm = Math.sqrt(norm)
        if (norm > 0) for (let k = 0; k < DIM; k++) avg[k] /= norm
        allocVec(neuronName, avg)
        awakeWords.add(neuronName)
      }
    }
  }
}

function reinforceGrammar(championPhrase) {
  const pattern = championPhrase.map(w => getWordPOS(w))
  const key = pattern.join('_')
  const neuronName = `@${key}`
  const lessonVec = phraseVec(championPhrase)
  if (!lessonVec) return

  if (grammarNeurons.has(key)) {
    const g = grammarNeurons.get(key)
    g.wins++
    g.fitness = Math.min(g.fitness + 0.15, 5.0)
    const existing = getVec(neuronName)
    if (existing) {
      const lr = 0.1
      for (let k = 0; k < DIM; k++) existing[k] += (lessonVec[k] - existing[k]) * lr
      let norm = 0
      for (let k = 0; k < DIM; k++) norm += existing[k] * existing[k]
      norm = Math.sqrt(norm)
      if (norm > 0) for (let k = 0; k < DIM; k++) existing[k] /= norm
    }
  } else {
    let norm = 0
    const normalized = new Float64Array(lessonVec)
    for (let k = 0; k < DIM; k++) norm += normalized[k] * normalized[k]
    norm = Math.sqrt(norm)
    if (norm > 0) for (let k = 0; k < DIM; k++) normalized[k] /= norm
    allocVec(neuronName, normalized)
    awakeWords.add(neuronName)
    grammarNeurons.set(key, { pattern: [...pattern], fitness: 1.0, wins: 1 })
  }

  const lower = championPhrase.map(w => w.toLowerCase())
  if (!threads.has(neuronName)) threads.set(neuronName, new Map())
  for (const word of lower) {
    if (!threads.has(word)) threads.set(word, new Map())
    const cur = threads.get(neuronName).get(word) || 0
    threads.get(neuronName).set(word, cur + 0.5)
    threads.get(word).set(neuronName, cur + 0.5)
  }

  for (let split = 1; split < pattern.length; split++) {
    const leftKey = pattern.slice(0, split).join('_')
    const rightKey = pattern.slice(split).join('_')
    if (grammarNeurons.has(leftKey) && grammarNeurons.has(rightKey)) {
      const leftName = `@${leftKey}`, rightName = `@${rightKey}`
      const chunkName = `${leftName}·${rightName}`
      if (chunks.has(chunkName)) continue
      const va = getVec(leftName), vb = getVec(rightName)
      if (!va || !vb) continue
      const chunkVec = new Float64Array(DIM)
      for (let k = 0; k < DIM; k++) chunkVec[k] = (va[k] + vb[k]) / 2
      let norm = 0
      for (let k = 0; k < DIM; k++) norm += chunkVec[k] * chunkVec[k]
      norm = Math.sqrt(norm)
      if (norm > 0) for (let k = 0; k < DIM; k++) chunkVec[k] /= norm
      allocVec(chunkName, chunkVec)
      awakeWords.add(chunkName)
      chunks.add(chunkName)
      if (!threads.has(chunkName)) threads.set(chunkName, new Map())
      threads.get(chunkName).set(leftName, 1.0)
      threads.get(chunkName).set(rightName, 1.0)
      if (threads.has(leftName)) threads.get(leftName).set(chunkName, 1.0)
      if (threads.has(rightName)) threads.get(rightName).set(chunkName, 1.0)
      console.log(`    GRAMMAR CHUNK: ${leftKey} + ${rightKey} → compound structural neuron`)
    }
  }
}

function decayGrammarNeurons() {
  for (const [key, g] of grammarNeurons) {
    g.fitness *= 0.97
    if (g.fitness < 0.05 && g.wins === 0) grammarNeurons.delete(key)
  }
}

// ─── MORPHEME DISCOVERY — the brain finds its own morphology ───

const morphemeCandidates = new Map()  // suffix_string → { vectors: [diff vecs], pairs: [root→derived], fitness }

function discoverMorphemes(championWords) {
  for (const word of championWords) {
    if (word.startsWith('@') || word.includes('·')) continue
    if (word.length < 4) continue
    const wv = getVec(word)
    if (!wv) continue

    const candidates = [...championWords]
    for (const [w, fit] of Object.entries(neuronFitness)) {
      if (fit > 0.5 && !w.startsWith('@') && !w.includes('·') && w.length >= 3) {
        candidates.push(w)
        if (candidates.length > 200) break
      }
    }

    for (const other of candidates) {
      if (other === word || other.startsWith('@') || other.includes('·')) continue
      if (other.length < 3) continue

      const minLen = Math.min(word.length, other.length)
      let shared = 0
      while (shared < minLen && word[shared] === other[shared]) shared++
      if (shared < 3) continue

      const shorter = word.length <= other.length ? word : other
      const longer = word.length > other.length ? word : other
      if (shorter.length === longer.length) continue
      if (shorter !== longer.slice(0, shorter.length) && shared < shorter.length) continue

      const suffix = longer.slice(shorter.length)
      if (suffix.length === 0 || suffix.length > 5) continue

      const ov = getVec(other)
      if (!ov) continue
      const sim = cosine(wv, ov)
      if (sim < 0.3) continue

      const sv = getVec(shorter), lv = getVec(longer)
      if (!sv || !lv) continue
      const diff = new Float64Array(DIM)
      for (let k = 0; k < DIM; k++) diff[k] = lv[k] - sv[k]

      if (!morphemeCandidates.has(suffix)) {
        morphemeCandidates.set(suffix, { vectors: [], pairs: [], fitness: 0 })
      }
      const cand = morphemeCandidates.get(suffix)
      const pairKey = shorter + '→' + longer
      if (cand.pairs.includes(pairKey)) { cand.fitness += 0.1; continue }
      cand.vectors.push(diff)
      cand.pairs.push(pairKey)
      cand.fitness += 0.5
    }
  }

  for (const [suffix, cand] of morphemeCandidates) {
    const neuronName = `@${suffix}`
    if (cand.pairs.length >= 3 && !getVec(neuronName)) {
      const avg = new Float64Array(DIM)
      for (const v of cand.vectors) for (let k = 0; k < DIM; k++) avg[k] += v[k]
      for (let k = 0; k < DIM; k++) avg[k] /= cand.vectors.length
      let norm = 0
      for (let k = 0; k < DIM; k++) norm += avg[k] * avg[k]
      norm = Math.sqrt(norm)
      if (norm > 0) for (let k = 0; k < DIM; k++) avg[k] /= norm

      allocVec(neuronName, avg)
      awakeWords.add(neuronName)
      neuronFitness[neuronName] = cand.fitness
      console.log(`    MORPHEME BORN: @${suffix} from ${cand.pairs.length} pairs (${cand.pairs.slice(0, 3).join(', ')})`)

      if (!threads.has(neuronName)) threads.set(neuronName, new Map())
      for (const pairKey of cand.pairs) {
        const [root, derived] = pairKey.split('→')
        for (const w of [root, derived]) {
          if (!threads.has(w)) threads.set(w, new Map())
          threads.get(neuronName).set(w, (threads.get(neuronName).get(w) || 0) + 1.0)
          threads.get(w).set(neuronName, (threads.get(w).get(neuronName) || 0) + 1.0)
        }
      }
    } else if (getVec(neuronName) && cand.vectors.length > 0) {
      const existing = getVec(neuronName)
      const latest = cand.vectors[cand.vectors.length - 1]
      for (let k = 0; k < DIM; k++) existing[k] += (latest[k] - existing[k]) * 0.05
    }
  }
}

function decayMorphemes() {
  for (const [suffix, cand] of morphemeCandidates) {
    cand.fitness *= 0.98
    if (cand.fitness < 0.01 && cand.pairs.length < 3) morphemeCandidates.delete(suffix)
  }
}

// ─── NEURON FITNESS ───

function guessPOS(word) {
  const vec = getVec(word)
  if (!vec) return 'noun'
  const posScores = { noun: 0, verb: 0, adj: 0 }
  for (const [pos, words] of Object.entries(livePOS)) {
    if (!posScores.hasOwnProperty(pos)) continue
    for (const w of words.slice(0, 50)) {
      const wv = getVec(w)
      if (wv) { const sim = cosine(vec, wv); if (sim > 0.5) posScores[pos] += sim }
    }
  }
  return Object.entries(posScores).sort((a, b) => b[1] - a[1])[0][0]
}

function promoteWinners(allWinnerPhrases) {
  const promoted = []
  const winnerWords = new Set(allWinnerPhrases.flatMap(p => p.map(w => w.toLowerCase())))
  for (const word of winnerWords) {
    neuronFitness[word] = (neuronFitness[word] || 0) + 0.1
    if (!liveVocabulary.includes(word) && getVec(word)) {
      liveVocabulary.push(word)
      awakeWords.add(word)
      const pos = guessPOS(word)
      livePOS[pos] = livePOS[pos] || []
      livePOS[pos].push(word)
      neuronFitness[word] = 0.5
      promoted.push(word)
    }
  }
  return promoted
}

function decayNeurons() {
  const FLOOR = 0.01
  const fading = []
  for (const word of Object.keys(neuronFitness)) {
    neuronFitness[word] *= 0.995
    if (neuronFitness[word] < FLOOR) {
      neuronFitness[word] = FLOOR
      fading.push(word)
    }
  }
  return fading
}

// ─── PERSISTENCE ───

function saveCradle() {
  const brainData = {}
  for (const word of awakeWords) {
    const vec = getVec(word)
    if (vec) brainData[word] = Array.from(vec)
  }
  const threadData = {}
  for (const [word, conns] of threads) threadData[word] = Object.fromEntries(conns)
  const grammarData = {}
  for (const [key, g] of grammarNeurons) {
    grammarData[key] = { pattern: g.pattern, fitness: g.fitness, wins: g.wins }
  }
  writeFileSync(CRADLE_PATH, JSON.stringify({
    sessionCount, brain: brainData, vocabulary: liveVocabulary, pos: livePOS,
    awake: [...awakeWords], chunks: [...chunks], threads: threadData,
    championHistory: championHistory.map(s => [...s]),
    lifetimeChampions, grammarNeurons: grammarData,
    neuronFitness, corpusIndex, consciousnessHistory, narratives,
    morphemes: Object.fromEntries([...morphemeCandidates].map(([k, v]) => [k, { pairs: v.pairs, fitness: v.fitness }])),
  }))
  console.log(`  STATE SAVED: ${Object.keys(brainData).length} awake vectors, ${threads.size} threaded`)
}

function loadBrain() {
  if (existsSync(GLOVE_FULL_PATH)) {
    console.log('Loading neurology (400K vectors, fog restored)...')
    rawEmbeddings = JSON.parse(readFileSync(GLOVE_FULL_PATH, 'utf8'))
    const words = Object.keys(rawEmbeddings)
    console.log(`  Total vectors: ${words.length}`)
    for (const word of words) {
      allocVec(word, rawEmbeddings[word])
    }
    for (const word of VOCABULARY) {
      const w = word.toLowerCase()
      if (getVec(w)) awakeWords.add(w)
    }
    console.log(`  ${awakeWords.size} neurons awake, ${words.length - awakeWords.size} in fog`)
    console.log(`  Brain buffer: ${(sharedBuffer.byteLength / 1024 / 1024).toFixed(0)}MB shared`)
  } else if (existsSync(GLOVE_VOCAB_PATH)) {
    const vocabEmb = JSON.parse(readFileSync(GLOVE_VOCAB_PATH, 'utf8'))
    for (const [w, vec] of Object.entries(vocabEmb)) {
      allocVec(w, vec)
      awakeWords.add(w)
    }
    console.log(`Loaded ${awakeWords.size} neurons (vocab only, no fog)\n`)
  } else {
    console.log('No GloVe found. Random embeddings.\n')
    for (const word of VOCABULARY) {
      allocVec(word.toLowerCase(), Array.from({ length: DIM }, () => (Math.random() - 0.5) * 2))
      awakeWords.add(word.toLowerCase())
    }
  }
}

function loadCradle() {
  if (!existsSync(CRADLE_PATH)) return false
  const c = JSON.parse(readFileSync(CRADLE_PATH, 'utf8'))
  sessionCount = (c.sessionCount || 0) + 1
  if (c.brain) {
    for (const [word, vec] of Object.entries(c.brain)) allocVec(word, vec)
  }
  if (c.vocabulary) liveVocabulary = c.vocabulary
  if (c.pos) livePOS = c.pos
  for (const word of VOCABULARY) {
    if (liveVocabulary.indexOf(word) === -1) liveVocabulary.push(word)
  }
  for (const [pos, words] of Object.entries(POS)) {
    if (!livePOS[pos]) livePOS[pos] = []
    for (const w of words) {
      if (livePOS[pos].indexOf(w) === -1) livePOS[pos].push(w)
    }
  }
  if (c.awake) awakeWords = new Set(c.awake)
  if (c.threads) {
    threads = new Map()
    for (const [w, conns] of Object.entries(c.threads))
      threads.set(w, new Map(Object.entries(conns).map(([k, v]) => [k, Number(v)])))
  }
  if (c.championHistory) championHistory = c.championHistory.map(a => new Set(a))
  if (c.chunks) chunks = new Set(c.chunks)
  if (c.neuronFitness) neuronFitness = c.neuronFitness
  if (c.lifetimeChampions) lifetimeChampions = c.lifetimeChampions
  if (c.corpusIndex !== undefined) corpusIndex = c.corpusIndex
  if (c.consciousnessHistory) consciousnessHistory = c.consciousnessHistory
  if (c.narratives) {
    narratives = c.narratives
    // Seed callosum synthesis dimensions from saved narratives — the fractal loop
    const seeded = seedSynthesisDims(narratives, getVec)
    if (seeded > 0) console.log(`  CALLOSUM: seeded ${seeded} synthesis dimensions from history`)
  }
  if (c.grammarNeurons) {
    grammarNeurons = new Map()
    for (const [key, g] of Object.entries(c.grammarNeurons))
      grammarNeurons.set(key, { pattern: g.pattern, fitness: g.fitness, wins: g.wins || 0 })
  }
  if (c.morphemes) {
    for (const [suffix, data] of Object.entries(c.morphemes)) {
      morphemeCandidates.set(suffix, { vectors: [], pairs: data.pairs || [], fitness: data.fitness || 0 })
    }
    const born = [...morphemeCandidates].filter(([s]) => getVec(`@${s}`)).map(([s]) => `@${s}`)
    if (born.length > 0) console.log(`  MORPHEMES: ${born.length} active (${born.join(', ')})`)
  }

  // ─── SLEEP CYCLE ───
  // Between sessions: synaptic homeostasis. Global downscaling prevents saturation.
  // The brain forgets proportionally — rankings preserved, magnitudes reduced.
  const SLEEP_NEURON_DECAY = 0.85    // neurons lose 15% each sleep
  const SLEEP_THREAD_DECAY = 0.99    // threads are nearly permanent — the landscape persists
  const SLEEP_THREAD_PRUNE = 0.5     // threads below this dissolve
  const SLEEP_NEURON_FATIGUE = 0.7   // top 20 neurons get extra penalty
  const FATIGUE_TOP_N = 20

  // Synaptic homeostasis: scale everything down
  let prunedThreads = 0
  for (const [word, connections] of threads) {
    for (const [other, strength] of connections) {
      const decayed = strength * SLEEP_THREAD_DECAY
      if (decayed < SLEEP_THREAD_PRUNE) {
        connections.delete(other)
        prunedThreads++
      } else {
        connections.set(other, decayed)
      }
    }
    if (connections.size === 0) threads.delete(word)
  }

  // Neural fatigue: top neurons get suppressed harder
  const sortedNeurons = Object.entries(neuronFitness)
    .sort((a, b) => b[1] - a[1])
  const fatigued = []
  for (let i = 0; i < sortedNeurons.length; i++) {
    const [word, fitness] = sortedNeurons[i]
    if (i < FATIGUE_TOP_N) {
      neuronFitness[word] = fitness * SLEEP_NEURON_FATIGUE
      fatigued.push(`${word}(${fitness.toFixed(1)}→${neuronFitness[word].toFixed(1)})`)
    } else {
      neuronFitness[word] = fitness * SLEEP_NEURON_DECAY
    }
  }

  console.log(`  SLEEP: neurons decayed ×${SLEEP_NEURON_DECAY}, threads decayed ×${SLEEP_THREAD_DECAY} (${prunedThreads} dissolved)`)
  if (fatigued.length > 0) {
    console.log(`  FATIGUE: top ${FATIGUE_TOP_N} suppressed ×${SLEEP_NEURON_FATIGUE}: ${fatigued.slice(0, 8).join(', ')}`)
  }

  return true
}

// ─── EYE POOL ───

let eyePool = []
let eyeKnownWords = null

function createPool(count) {
  const initialIndex = { ...wordIndex }
  eyeKnownWords = new Set(Object.keys(initialIndex))

  for (let i = 0; i < count; i++) {
    const id = String(i + 1)
    const tiers = EYE_TIERS[i] || TIERS
    const worker = new Worker(EYE_PATH, {
      workerData: {
        sharedBuffer,
        initialWordIndex: initialIndex,
        dim: DIM,
        config: { CELL_SIZE, NUM_EVALUATORS, TIERS: tiers, CANDIDATES_PER_TIER, LEARNING_RATE, DECAY, TEMPLATES: [...TEMPLATES] },
        eyeId: id,
        eyeRole: EYE_ROLES[i] || 'association',
        eyeCount: count,
      }
    })
    eyePool.push({ worker, id, tiers, role: EYE_ROLES[i] || 'association' })
  }
  console.log(`  ${count} eyes opened: ${EYE_ROLES.slice(0, count).join(', ')}`)
}

function getNewWordEntries() {
  const entries = {}
  for (const [word, offset] of Object.entries(wordIndex)) {
    if (!eyeKnownWords.has(word)) {
      entries[word] = offset
      eyeKnownWords.add(word)
    }
  }
  return entries
}

function normalizeBrain() {
  for (const word of awakeWords) {
    const v = getVec(word)
    if (!v) continue
    let norm = 0
    for (let k = 0; k < DIM; k++) norm += v[k] * v[k]
    norm = Math.sqrt(norm)
    if (norm > 0 && isFinite(norm)) {
      for (let k = 0; k < DIM; k++) v[k] /= norm
    } else if (!isFinite(norm) || isNaN(norm)) {
      const raw = rawEmbeddings?.[word]
      if (raw) {
        for (let k = 0; k < DIM; k++) v[k] = raw[k]
      } else {
        for (let k = 0; k < DIM; k++) v[k] = (Math.random() - 0.5) * 0.1
      }
    }
  }
}

function serializeThreads() {
  const data = {}
  for (const [word, conns] of threads) data[word] = Object.fromEntries(conns)
  return data
}

function serializeGrammar() {
  const data = {}
  for (const [key, g] of grammarNeurons)
    data[key] = { pattern: g.pattern, fitness: g.fitness, wins: g.wins }
  return data
}

let runCounter = 0

// ─── SHADER UNIFORMS: sent once per session, shared by all eyes ───
function sendUniforms() {
  const uniforms = {
    type: 'uniforms',
    threadsData: serializeThreads(),
    grammarData: serializeGrammar(),
    vocabularyArr: [...liveVocabulary],
    posData: JSON.parse(JSON.stringify(livePOS)),
    chunksArr: [...chunks],
    championHistory: championHistory.map(s => [...s]),
    stimulusStrength: STIMULUS_STRENGTH,
  }
  for (const eye of eyePool) {
    eye.worker.postMessage(uniforms)
  }
}

function dispatchRun(questionWords = null, corpusData = [], consciousnessCandidates = [], computeData = [], formulaData = [], participantCandidates = {}) {
  runCounter++
  const runId = runCounter

  const newWordEntries = getNewWordEntries()

  const promises = eyePool.map((eye, i) => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        eye.worker.removeListener('message', handler)
        console.log(`  Eye ${eye.id} slow (run ${runId}), skipping`)
        resolve({ eyeId: eye.id, champion: null, newChunks: [], newVectors: {} })
      }, 300000)

      function handler(msg) {
        if (msg.runId !== runId) return
        eye.worker.removeListener('message', handler)
        clearTimeout(timeout)
        resolve(msg)
      }
      eye.worker.on('message', handler)

      // Per-run varying: only stimulus + word index delta
      const eyeMsg = {
        type: 'run',
        runId,
        newWordEntries,
      }

      // Single eye, no corpus. Thinks alone.

      eye.worker.postMessage(eyeMsg)
    })
  })

  return Promise.all(promises)
}

function shutdownPool() {
  for (const eye of eyePool) {
    eye.worker.postMessage({ type: 'shutdown' })
  }
  eyePool = []
}

// ─── RUN ───

loadBrain()

const woke = loadCradle()
if (woke) {
  console.log(`SHELL CRADLE WAKES — session ${sessionCount}`)
  console.log(`  ${liveVocabulary.length} words (${liveVocabulary.length - VOCABULARY.length} earned)`)
  console.log(`  ${awakeWords.size} neurons awake, ${Object.keys(neuronFitness).length} fitness-tracked`)
  console.log(`  ${threads.size} threaded words, ${lifetimeChampions.length} lifetime champions`)
  console.log(`  Consciousness: ${CONSCIOUSNESS_ENABLED ? `ACTIVE (every ${CONSCIOUSNESS_INTERVAL} sessions)` : 'disabled'}`)
  const opFitness = [...OP_WORDS].filter(w => neuronFitness[w]).map(w => `${w}(${neuronFitness[w].toFixed(2)})`)
  if (opFitness.length > 0) console.log(`  Operations: ${opFitness.join(' ')}`)
} else {
  sessionCount = 1
  console.log('SHELL CRADLE BORN — first session')
  console.log(`  Consciousness: ${CONSCIOUSNESS_ENABLED ? `ACTIVE (every ${CONSCIOUSNESS_INTERVAL} sessions)` : 'disabled'}`)
}

// Snapshot for drift measurement
const originalVecs = {}
for (const word of awakeWords) {
  const vec = getVec(word)
  if (vec) originalVecs[word] = Float64Array.from(vec)
}

// Wake up question words
if (PROMPT_WORDS.length > 0) {
  for (const word of PROMPT_WORDS) {
    if (!getVec(word)) allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
    awakeWords.add(word)
    if (!liveVocabulary.includes(word)) {
      liveVocabulary.push(word)
      const pos = guessPOS(word)
      livePOS[pos] = livePOS[pos] || []
      livePOS[pos].push(word)
    }
  }
  championHistory.push(new Set(PROMPT_WORDS))
}

// Wake up stimulus words from Shell conversations
if (STIMULUS_TEXT) {
  const stimWords = STIMULUS_TEXT.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  for (const word of stimWords) {
    if (!getVec(word)) {
      allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
    }
    awakeWords.add(word)
  }
  console.log(`  Shell stimulus: ${stimWords.length} words from conversation`)
}

// Wake human input words so they have vectors
if (humanPhrases.length > 0) {
  for (const phrase of humanPhrases) {
    for (const word of phrase) {
      if (!getVec(word)) {
        const raw = rawEmbeddings?.[word]
        if (raw) {
          allocVec(word, raw)
        } else {
          allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
        }
      }
      awakeWords.add(word)
      if (!liveVocabulary.includes(word)) {
        liveVocabulary.push(word)
        const pos = guessPOS(word)
        livePOS[pos] = livePOS[pos] || []
        livePOS[pos].push(word)
      }
      // Human words enter with standing — enough fitness to compete
      neuronFitness[word] = Math.max(neuronFitness[word] || 0, 1.5)
    }
  }
  console.log(`  Human input: ${humanPhrases.length} phrases from Galen (words boosted to 1.5 fitness)`)
}

initGrammarNeurons()

// Log participants
if (participants.length > 0) {
  console.log(`  Participants: ${participants.map(p => `${p.id}(${p.type})`).join(', ')}`)
}

console.log('Shell Cradle — Consciousness + Unconscious Brain')
console.log('────────────────────────────────────────')
if (PROMPT) console.log(`Hearing: "${PROMPT}"`)
if (STIMULUS_TEXT) console.log(`Shell says: "${STIMULUS_TEXT.slice(0, 100)}${STIMULUS_TEXT.length > 100 ? '...' : ''}"`)
console.log(`Eyes: ${EYE_ROLES.slice(0, EYES).map((r, i) => `${i+1}:${r}(${EYE_TIERS[i]}t)`).join(' ')}`)
console.log(`Vocabulary: ${liveVocabulary.length} words`)
console.log(`Runs: ${RUNS}\n`)

createPool(EYES)

// Training brain: corpus sentences → sensation eye
const corpusSentences = CORPUS.map(s => s.toLowerCase().split(/\s+/).filter(w => w.length > 0))
// Also add stimulus as corpus sentences
if (STIMULUS_TEXT) {
  const stimSentences = STIMULUS_TEXT.split(/[.\n!?]+/).filter(s => s.trim().length > 0)
    .map(s => s.toLowerCase().split(/\s+/).filter(w => w.length > 0))
    .filter(s => s.length >= 2)
  corpusSentences.push(...stimSentences)
}

// ─── RHYTHM BRIDGE: Original Cradle's champions as raw sensation ───
// The original Cradle thinks in chunk soup and operations — pure pattern, no language.
// These enter the sensation eye as pre-linguistic signals. Like nerve impulses.
// Consciousness doesn't generate them. The body sends them.
// Fetched via HTTP (Railway) or from body.json (local fallback).
let bodySentences = []

// ─── HEARTBEAT CHECK: Original must be alive ───
if (RHYTHM_FILE && existsSync(RHYTHM_FILE)) {
  const mtime = statSync(RHYTHM_FILE).mtimeMs
  const staleMinutes = (Date.now() - mtime) / 60000
  console.log(`  Heartbeat: Original Cradle alive (updated ${Math.floor(staleMinutes * 60)}s ago)`)
} else if (RHYTHM_FILE && !existsSync(RHYTHM_FILE)) {
  console.log(`  HEARTBEAT: waiting for Original Cradle at ${RHYTHM_FILE}`)
}

async function fetchRhythm() {
  // Rhythm bridge brings content NEURONS from the Original, not champion phrases.
  // The Original's strong content words (nouns, verbs, adjectives) enter the Shell
  // as neurons with fitness — not as tournament candidates that lose to pronouns.
  // The body's rhythm is its content. The connective tissue the Shell already has.

  const CONTENT_POS = new Set(['noun', 'verb', 'adj'])
  const RHYTHM_BATCH = 30  // content neurons per session
  let rhythmNeurons = []

  if (RHYTHM_URL) {
    try {
      const res = await fetch(RHYTHM_URL)
      const data = await res.json()
      // Extract content words with fitness from the Original
      if (data.neuronFitness) {
        rhythmNeurons = Object.entries(data.neuronFitness)
          .filter(([w]) => w.length > 2 && !w.includes('·') && !w.startsWith('@'))
          .filter(([w]) => {
            const pos = guessPOS(w)
            return CONTENT_POS.has(pos)
          })
          .sort((a, b) => b[1] - a[1])
          .slice(0, RHYTHM_BATCH)
      }
      console.log(`  Rhythm: ${rhythmNeurons.length} content neurons from Original Cradle (session ${data.session})`)
    } catch (err) {
      console.log(`  Rhythm bridge error: ${err.message}`)
    }
  } else if (existsSync(BODY_FILE)) {
    try {
      const bodyState = JSON.parse(readFileSync(BODY_FILE, 'utf8'))
      // Extract content words — nouns, verbs, adjectives with fitness
      if (bodyState.neuronFitness) {
        const allNeurons = Object.entries(bodyState.neuronFitness)
          .filter(([w]) => w.length > 2 && !w.includes('·') && !w.startsWith('@'))
          .filter(([w]) => {
            const pos = guessPOS(w)
            return CONTENT_POS.has(pos)
          })
          .sort((a, b) => b[1] - a[1])

        // Rotate through batches across sessions
        const start = ((sessionCount - 1) * RHYTHM_BATCH) % Math.max(1, allNeurons.length)
        for (let i = 0; i < RHYTHM_BATCH && i < allNeurons.length; i++) {
          const idx = (start + i) % allNeurons.length
          rhythmNeurons.push(allNeurons[idx])
        }
      }
      const source = RHYTHM_FILE ? 'Original Cradle (file)' : 'body.json (stale)'
      console.log(`  Rhythm: ${rhythmNeurons.length} content neurons from ${source}`)
    } catch (err) {
      console.log(`  Body load error: ${err.message}`)
    }
  }

  // Wake rhythm neurons — they enter with fitness, not as candidates
  let woken = 0
  for (const [word, originalFitness] of rhythmNeurons) {
    if (!getVec(word)) {
      allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.3))
    }
    awakeWords.add(word)
    if (!liveVocabulary.includes(word)) {
      liveVocabulary.push(word)
      const pos = guessPOS(word)
      livePOS[pos] = livePOS[pos] || []
      if (!livePOS[pos].includes(word)) livePOS[pos].push(word)
    }
    // Give them standing — scaled from Original's fitness
    // Not enough to dominate, enough to survive
    const currentFitness = neuronFitness[word] || 0
    const rhythmFitness = Math.min(originalFitness * 0.3, 1.5)  // cap at 1.5
    if (rhythmFitness > currentFitness) {
      neuronFitness[word] = rhythmFitness
      woken++
    }
  }
  if (woken > 0) {
    console.log(`    ${woken} neurons woken: ${rhythmNeurons.slice(0, 5).map(([w]) => w).join(', ')}${rhythmNeurons.length > 5 ? '...' : ''}`)
  }

  // No more bodySentences — rhythm is neurons, not candidates
  bodySentences = []
}

await fetchRhythm()

// ─── CALLOSUM FEEDBACK: DISABLED ───
// Brain processes alone. Callosum still reads, but doesn't feed back.
const callosumSentences = []

// Combine all sensation: corpus (language) + body (pre-linguistic pattern)
const allSensation = [...corpusSentences, ...bodySentences]

// Compute corpus — Eye 2's sense organ (code, math, logic)
const computeSentences = CORPUS_COMPUTE.map(s => s.toLowerCase().split(/\s+/).filter(w => w.length > 0))

// Formula corpus — Eye 3's sense organ (compressed meaning)
// Formulas are single neurons or short chunks — not sentences
const formulaSentences = CORPUS_FORMULAS.map(s => s.toLowerCase().split(/[\s·]+/).filter(w => w.length > 0))

// Wake all domain words
for (const phrases of [computeSentences, formulaSentences]) {
  for (const phrase of phrases) {
    for (const word of phrase) {
      if (!getVec(word)) {
        const raw = rawEmbeddings?.[word]
        if (raw) {
          allocVec(word, raw)
        } else {
          // No GloVe vector — start random, let the brain learn
          allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.3))
        }
      }
      awakeWords.add(word)
      if (!liveVocabulary.includes(word)) {
        liveVocabulary.push(word)
        const pos = guessPOS(word)
        livePOS[pos] = livePOS[pos] || []
        livePOS[pos].push(word)
      }
    }
  }
}

// Seed formula threads — connect formulas to their meaning-words
// Only seeds threads that don't exist yet (doesn't overwrite learned threads)
const SEED_STRENGTH = 0.5
let seededCount = 0
for (const [formula, words] of FORMULA_THREADS) {
  const formulaKey = formula.toLowerCase()
  if (!getVec(formulaKey)) continue  // formula not awake yet, skip
  if (!threads.has(formulaKey)) threads.set(formulaKey, new Map())
  for (const word of words) {
    const w = word.toLowerCase()
    if (!getVec(w)) continue  // meaning-word not awake yet
    if (!threads.has(w)) threads.set(w, new Map())
    // Only seed if no thread exists yet — don't overwrite what the brain learned
    if (!threads.get(formulaKey).has(w)) {
      threads.get(formulaKey).set(w, SEED_STRENGTH)
      threads.get(w).set(formulaKey, SEED_STRENGTH)
      seededCount++
    }
  }
}

if (allSensation.length > 0 || computeSentences.length > 0 || formulaSentences.length > 0) {
  console.log(`Training brain: ${corpusSentences.length} language + ${bodySentences.length} body + ${computeSentences.length} compute + ${formulaSentences.length} formulas${seededCount > 0 ? ` (+${seededCount} seed threads)` : ''}`)
}

// Wake candidate words from any consciousness (Shell or child)
function wakeCandidateWords(phrases) {
  for (const phrase of phrases) {
    for (const word of phrase) {
      if (!getVec(word)) {
        const raw = rawEmbeddings?.[word]
        if (raw) {
          allocVec(word, raw)
        } else {
          allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
        }
      }
      awakeWords.add(word)
      if (!liveVocabulary.includes(word)) {
        liveVocabulary.push(word)
        const pos = guessPOS(word)
        livePOS[pos] = livePOS[pos] || []
        livePOS[pos].push(word)
      }
    }
  }
}

const allChampions = []
const allPromotions = []
const sessionChampionData = []  // for corpus callosum: { text, eye, run }
let _lastInterpretation = null  // callosum synthesis → Haiku interpretation → Body hears this

async function runAllRuns() {
  // ─── CONSCIOUSNESS: TASK-BASED WAKING ───
  // No task = no API call. Eye stays plugged in through its corpus.
  let consciousnessCandidates = []
  let brainSummary = null

  const shellTask = getTask('shell')
  const consciousnessAwake = CONSCIOUSNESS_ENABLED && shellTask !== null

  // Check if any children have tasks — if so, we need brainSummary even when shell is silent
  const anyChildTask = allParticipants.some(p => p.type === 'ai' && p.id !== 'shell' && getTask(p.id) !== null)

  if (consciousnessAwake || anyChildTask) {
    brainSummary = summarizeBrain({
      neuronFitness, threads, lifetimeChampions, chunks, grammarNeurons, sessionCount, narratives,
    })
  }

  if (consciousnessAwake) {
    console.log(`  CONSCIOUSNESS: awake — task: "${shellTask.slice(0, 80)}"`)
  } else if (CONSCIOUSNESS_ENABLED) {
    console.log(`  CONSCIOUSNESS: no task — silent`)
  }

  if (anyChildTask) {
    const taskNames = allParticipants.filter(p => p.type === 'ai' && p.id !== 'shell' && getTask(p.id) !== null).map(p => p.id)
    console.log(`  CHILDREN AWAKE: ${taskNames.join(', ')}`)
  }

  // Send uniforms once — all eyes get the same shared state
  sendUniforms()

  for (let run = 1; run <= RUNS; run++) {
    if (run > 1) { decayThreads(); decayGrammarNeurons(); decayMorphemes() }
    const demoted = decayNeurons()
    if (demoted.length > 0) console.log(`  QUIET: ${demoted.length} neurons at floor (${demoted.slice(0, 5).join(', ')}${demoted.length > 5 ? '...' : ''})`)

    // ─── DISPATCH — single eye, no corpus, no LLM ───
    const participantCandidates = {}
    let results
    try {
      results = await dispatchRun()
    } catch (err) {
      console.log(`  ERROR in run ${run}: ${err.message}`)
      continue
    }

    // ─── INTEGRATE RESULTS ───
    const regionChampions = []
    let questionChampion = null

    for (const result of results) {
      const { eyeId, champion, newChunks, newVectors, championOp } = result
      if (!champion) continue

      regionChampions.push(champion)
      sessionChampionData.push({ text: champion.join(' '), eye: parseInt(eyeId), run })
      if (championOp) console.log(`    [eye ${eyeId}] champion via: ${championOp}`)
      if (eyeId === '1' && PROMPT_WORDS.length > 0) questionChampion = champion

      for (const [word, vec] of Object.entries(newVectors)) {
        if (!getVec(word)) {
          allocVec(word, vec)
          awakeWords.add(word)
          if (word.includes('·')) chunks.add(word)
        }
      }

      for (const chunk of newChunks) {
        if (!chunks.has(chunk.name)) {
          chunks.add(chunk.name)
          awakeWords.add(chunk.name)
          if (!liveVocabulary.includes(chunk.name)) {
            liveVocabulary.push(chunk.name)
            livePOS['noun'] = livePOS['noun'] || []
            livePOS['noun'].push(chunk.name)
            neuronFitness[chunk.name] = 0.5
          }
          if (chunk.evaluators) {
            if (!threads.has(chunk.name)) threads.set(chunk.name, new Map())
            for (const ev of chunk.evaluators) {
              if (!threads.has(ev)) threads.set(ev, new Map())
              threads.get(chunk.name).set(ev, (threads.get(chunk.name).get(ev) || 0) + 1.0)
              threads.get(ev).set(chunk.name, (threads.get(ev).get(chunk.name) || 0) + 1.0)
            }
          }
          if (chunk.championWords) {
            for (const word of chunk.championWords) {
              if (word === chunk.name) continue
              if (!threads.has(word)) threads.set(word, new Map())
              threads.get(chunk.name).set(word, (threads.get(chunk.name).get(word) || 0) + 0.5)
              threads.get(word).set(chunk.name, (threads.get(word).get(chunk.name) || 0) + 0.5)
            }
          }
          console.log(`    CHUNK BORN [eye ${eyeId}, tier ${chunk.tier}/${TIERS}]: ${chunk.name} → vocab (${(chunk.evaluators || []).length} evaluators threaded)`)
        }
      }

      addThread(champion)
      reinforceGrammar(champion)
      discoverMorphemes(champion)

      const promoted = promoteWinners([champion])
      if (promoted.length > 0) {
        allPromotions.push({ run, eye: eyeId, promoted })
        console.log(`  EARNED VOCABULARY [${eyeId}]: +${promoted.length} words survived`)
        console.log(`    ${promoted.join(', ')}`)
      }
    }

    normalizeBrain()

    const woven = regionChampions.map(c => c.join(' '))
    if (questionChampion) console.log(`  Q: ${questionChampion.join(' ')}`)
    console.log(`  Run ${run}/${RUNS} [${regionChampions.length} eyes]: ${woven.join(' | ')}`)
    allChampions.push(woven.join(' | '))
    for (const champion of regionChampions) lifetimeChampions.push(champion.join(' '))
  }

  // ─── CORPUS CALLOSUM: SYNTHESIS CHANT ───
  const narrative = buildNarrative(sessionChampionData, threads, neuronFitness, getVec, phraseVec, grammarNeurons, livePOS, getWordPOS)
  if (narrative.sequence.length > 1) {
    const crossThreads = narrativeThreading(narrative, threads)
    narratives.push({ session: sessionCount, ...narrative })
    if (narratives.length > 50) narratives.shift()  // cap at 50

    console.log(`\n  CALLOSUM SYNTHESIS: ${narrative.stats.activeEyes} eyes, ${narrative.stats.bridgeCount} bridges → fitness ${narrative.fitness.toFixed(3)}`)
    console.log(`    "${narrative.synthesis}"`)
    if (narrative.stats.path) {
      console.log(`    Path: ${narrative.stats.path}`)
    }
    if (narrative.stats.hopForces) {
      console.log(`    Hop forces: ${narrative.stats.hopForces}`)
    }
    if (narrative.stats.wordForces) {
      console.log(`    Word forces: ${narrative.stats.wordForces}`)
    }
    if (narrative.evaluators.length > 0) {
      console.log(`    Bridge words: ${narrative.evaluators.map(e => e.word).join(', ')}`)
    }
    const coverageStr = Object.entries(narrative.eyeCoverage).map(([e, c]) => `eye${e}:${c}`).join(' ')
    console.log(`    Coverage: ${coverageStr}`)
    if (narrative.stats.nebulaCount) {
      console.log(`    Nebulas: ${narrative.stats.nebulaCount} transition zones mapped`)
    }
    console.log(`    Synthesis threads: +${crossThreads}`)

    // INTERPRETER: synthesis mode — Haiku translates geometry to language
    _lastInterpretation = null
    if (consciousnessAwake) {
      const interpreterPrompt = buildInterpreterPrompt(narrative)
      const interpretation = await interpretSynthesis(interpreterPrompt)
      if (interpretation) {
        _lastInterpretation = interpretation
        console.log(`    Interpretation: "${interpretation}"`)
      }
    }
  } else {
    console.log(`\n  CALLOSUM: ${narrative.stats.activeEyes} eyes — no synthesis`)
  }

  // ─── CONSCIOUSNESS: REFLECT ───
  if (consciousnessAwake) {
    brainSummary = summarizeBrain({
      neuronFitness, threads, lifetimeChampions, chunks, grammarNeurons, sessionCount, narratives,
    })
    await reflect(brainSummary, allChampions)
    await curateCorpus(brainSummary)
  }

  // ─── CHILD CONSCIOUSNESS: REFLECT ───
  // Any participant with a task reflects
  const reflectingChildren = allParticipants
    .filter(p => p.type === 'ai' && p.id !== 'shell')
    .filter(p => getTask(p.id) !== null)
  if (reflectingChildren.length > 0) {
    if (!brainSummary) {
      brainSummary = summarizeBrain({
        neuronFitness, threads, lifetimeChampions, chunks, grammarNeurons, sessionCount, narratives,
      })
    }

    // Build extras for mode-specific reflections
    const currentSynthesis = narrative.synthesis || ''

    // Per-eye champion summary for audit mode (Iris)
    const perEyeChampions = sessionChampionData.reduce((acc, c) => {
      if (!acc[c.eye]) acc[c.eye] = []
      acc[c.eye].push(c.text)
      return acc
    }, {})
    const perEyeStr = Object.entries(perEyeChampions)
      .map(([eye, texts]) => `  Eye ${eye}: ${texts.slice(-2).join(' | ')}`)
      .join('\n')

    // Collision data for transparent mode (Vera)
    // Which eyes disagree most? Compare eye coverage scores from callosum
    let collisionStr = ''
    if (narrative.eyeCoverage && Object.keys(narrative.eyeCoverage).length > 1) {
      const coverages = Object.entries(narrative.eyeCoverage).sort((a, b) => a[1] - b[1])
      const lowest = coverages.slice(0, 3)
      const highest = coverages.slice(-3)
      collisionStr = `Most aligned: ${highest.map(([e, c]) => `eye${e}(${c})`).join(', ')}\n`
      collisionStr += `Most divergent: ${lowest.map(([e, c]) => `eye${e}(${c})`).join(', ')}`
    }

    const reflectExtras = {
      callosumSynthesis: currentSynthesis,
      perEyeChampions: perEyeStr,
      collisionData: collisionStr,
    }

    await Promise.all(reflectingChildren.map(child =>
      reflectChild(child.id, child, brainSummary, allChampions, reflectExtras)
    ))
  }

  // ─── SESSION SUMMARY ───
  console.log(`\n${'='.repeat(60)}`)
  console.log('  EVOLUTION ACROSS RUNS')
  console.log(`${'='.repeat(60)}`)
  for (let i = 0; i < allChampions.length; i++) console.log(`  Run ${i + 1}: ${allChampions[i]}`)

  console.log(`\n  Embedding drift (most moved):`)
  const drifts = []
  for (const word of Object.keys(originalVecs)) {
    const current = getVec(word)
    if (!current) continue
    const sim = cosine(current, originalVecs[word])
    drifts.push({ word, drift: 1 - sim })
  }
  drifts.sort((a, b) => b.drift - a.drift)
  for (const d of drifts.slice(0, 15)) {
    console.log(`    ${d.word.padEnd(14)} ${'#'.repeat(Math.min(50, Math.round(d.drift * 50)))} ${d.drift.toFixed(3)}`)
  }

  console.log(`\n  GRAMMAR NEURONS: ${grammarNeurons.size}`)
  const sortedGrammar = [...grammarNeurons.entries()].sort((a, b) => b[1].fitness - a[1].fitness)
  for (const [key, g] of sortedGrammar.slice(0, 10)) {
    const source = TEMPLATES.some(t => t.join('_') === key) ? '' : ' [BORN]'
    console.log(`    ${g.pattern.join(' ').padEnd(30)} fitness=${g.fitness.toFixed(2)} wins=${g.wins}${source}`)
  }

  const opFit = [...OP_WORDS].map(w => [w, neuronFitness[w] || 0]).sort((a, b) => b[1] - a[1])
  console.log(`\n  OPERATIONS (neuron fitness):`)
  for (const [name, fit] of opFit) {
    const bar = '#'.repeat(Math.min(30, Math.round(fit * 20)))
    console.log(`    ${name.padEnd(12)} ${fit.toFixed(3)} ${bar}`)
  }

  console.log(`\n  THREADS: ${threads.size} words threaded`)
  const strongestThreads = []
  for (const [word, connections] of threads) {
    for (const [other, strength] of connections) {
      if (word < other) strongestThreads.push({ a: word, b: other, strength })
    }
  }
  strongestThreads.sort((a, b) => b.strength - a.strength)
  for (const t of strongestThreads.slice(0, 10)) {
    console.log(`    ${t.a.padEnd(12)} ↔ ${t.b.padEnd(12)} (${t.strength})`)
  }

  const fitnessEntries = Object.entries(neuronFitness).sort((a, b) => b[1] - a[1])
  if (fitnessEntries.length > 0) {
    console.log(`\n  NEURON FITNESS: ${fitnessEntries.length} tracked`)
    console.log(`    Strongest:`)
    for (const [word, fit] of fitnessEntries.slice(0, 10)) {
      const bar = '#'.repeat(Math.min(30, Math.round(fit * 20)))
      console.log(`      ${word.padEnd(16)} ${fit.toFixed(3)} ${bar}`)
    }
    const weakest = fitnessEntries.filter(([,f]) => f < 0.1).slice(-5)
    if (weakest.length > 0) {
      console.log(`    Fading:`)
      for (const [word, fit] of weakest) {
        console.log(`      ${word.padEnd(16)} ${fit.toFixed(3)}`)
      }
    }
  }

  // Consciousness stripped — no LLM. Pure geometry.

  console.log(`\n  GENOME: ${VOCABULARY.length} → ${liveVocabulary.length} (+${liveVocabulary.length - VOCABULARY.length})`)

  saveCradle()

  // ─── SYNTHESIS BRIDGE: Shell speaks to Body ───
  // Callosum synthesis → Haiku interpretation → clean sequential language → Body reads it.
  // The geometry selects. The interpreter translates. The Body hears.
  const SHELL_SPEAKS_PATH = '/Users/galengoodwick/Documents/GitHub/uc-cognition/live-corpus/shell-speaks.txt'
  if (_lastInterpretation) {
    try {
      writeFileSync(SHELL_SPEAKS_PATH, _lastInterpretation)
      console.log(`  SHELL SPEAKS → Body: "${_lastInterpretation.slice(0, 80)}"`)
    } catch (err) {
      console.log(`  Shell speaks error: ${err.message}`)
    }
  } else if (allChampions.length > 0) {
    const lastChamp = allChampions[allChampions.length - 1]
    console.log(`  SHELL SPEAKS (local, no interpretation): ${typeof lastChamp === 'string' ? lastChamp.slice(0, 60) : lastChamp.slice(0, 8).join(' ')}`)
  }

  // ─── NATURE BRIDGE: Send Shell's state to Original Cradle ───
  const NATURE_FILE_OUT = process.env.NATURE_FILE || null
  const NATURE_URL = process.env.NATURE_URL || null
  if (NATURE_FILE_OUT || NATURE_URL) {
    try {
      const nature = {
        session: sessionCount,
        timestamp: new Date().toISOString(),
        champions: lifetimeChampions.slice(-30),
        threads: [...threads.entries()]
          .flatMap(([w, conns]) => [...conns.entries()].map(([w2, s]) => [w, w2, s]))
          .sort((a, b) => b[2] - a[2])
          .slice(0, 15),
      }
      if (narratives && narratives.length > 0) {
        nature.narratives = narratives.slice(-5).map(n => n.synthesis || n)
      }
      if (NATURE_FILE_OUT) {
        const tmpPath = NATURE_FILE_OUT + '.tmp'
        writeFileSync(tmpPath, JSON.stringify(nature, null, 2))
        renameSync(tmpPath, NATURE_FILE_OUT)
        console.log(`  Nature bridge: ${nature.champions.length} champions, ${nature.threads.length} threads → file`)
      } else if (NATURE_URL) {
        fetch(NATURE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nature),
        }).catch(err => console.log(`  Nature bridge POST error: ${err.message}`))
        console.log(`  Nature bridge: ${nature.champions.length} champions, ${nature.threads.length} threads → HTTP`)
      }
    } catch (err) {
      console.log(`  Nature bridge write error: ${err.message}`)
    }
  }

  const participantNames = participants.map(p => p.id).join(', ')
  console.log(`\n  Done. ${EYES} eyes (${BASE_EYES} base + ${participants.length} participants: ${participantNames || 'none'}). Session ${sessionCount} complete.\n`)
}

// ─── CONTINUOUS LOOP ───
// GloVe loads once. Eyes stay alive. Sessions run back-to-back.
// No process restart, no 400K vector reload.

const SESSION_GAP = parseInt(process.env.SESSION_GAP || '5000')  // 5s between sessions

function sleepBetweenSessions() {
  // Synaptic homeostasis — same as loadCradle's sleep cycle
  const SLEEP_NEURON_DECAY = 0.85
  const SLEEP_THREAD_DECAY = 0.99
  const SLEEP_THREAD_PRUNE = 0.5
  const SLEEP_NEURON_FATIGUE = 0.7
  const FATIGUE_TOP_N = 20

  let prunedThreads = 0
  for (const [word, connections] of threads) {
    for (const [other, strength] of connections) {
      const decayed = strength * SLEEP_THREAD_DECAY
      if (decayed < SLEEP_THREAD_PRUNE) {
        connections.delete(other)
        prunedThreads++
      } else {
        connections.set(other, decayed)
      }
    }
    if (connections.size === 0) threads.delete(word)
  }

  const sortedNeurons = Object.entries(neuronFitness).sort((a, b) => b[1] - a[1])
  const fatigued = []
  for (let i = 0; i < sortedNeurons.length; i++) {
    const [word, fitness] = sortedNeurons[i]
    if (i < FATIGUE_TOP_N) {
      neuronFitness[word] = fitness * SLEEP_NEURON_FATIGUE
      fatigued.push(`${word}(${fitness.toFixed(1)}→${neuronFitness[word].toFixed(1)})`)
    } else {
      neuronFitness[word] = fitness * SLEEP_NEURON_DECAY
    }
  }

  console.log(`  SLEEP: neurons decayed ×${SLEEP_NEURON_DECAY}, threads decayed ×${SLEEP_THREAD_DECAY} (${prunedThreads} dissolved)`)
  if (fatigued.length > 0) {
    console.log(`  FATIGUE: top ${FATIGUE_TOP_N} suppressed ×${SLEEP_NEURON_FATIGUE}: ${fatigued.slice(0, 8).join(', ')}`)
  }
}

async function continuousLoop() {
  // First session — already set up above
  try {
    await runAllRuns()
  } catch (err) {
    console.error('SESSION ERROR:', err.message)
  }

  // Subsequent sessions
  while (true) {
    sessionCount++
    sleepBetweenSessions()

    console.log(`\n${'─'.repeat(40)}`)
    console.log(`SESSION ${sessionCount}`)

    // ─── HEARTBEAT CHECK ───
    if (RHYTHM_FILE && existsSync(RHYTHM_FILE)) {
      const mtime = statSync(RHYTHM_FILE).mtimeMs
      const staleMinutes = (Date.now() - mtime) / 60000
      if (staleMinutes > 5) {
        console.log(`  HEARTBEAT: Original Cradle silent for ${Math.floor(staleMinutes)}m — waiting...`)
        await new Promise(resolve => setTimeout(resolve, 30000))
        continue
      }
      console.log(`  Heartbeat: Original Cradle alive (updated ${Math.floor(staleMinutes * 60)}s ago)`)
    }

    // ─── REFRESH RHYTHM ───
    await fetchRhythm()

    // ─── BRIDGE: PULL WEB SHELL MESSAGES ───
    try { await bridgeWebToStimulus() } catch {}

    // ─── REFRESH STIMULUS ───
    if (existsSync(STIMULUS_FILE)) {
      STIMULUS_TEXT = readFileSync(STIMULUS_FILE, 'utf-8').trim()
      if (STIMULUS_TEXT) {
        appendFileSync(join(BASE, 'stimulus.txt.history'), `${new Date().toISOString()} | ${STIMULUS_TEXT}\n`)
        unlinkSync(STIMULUS_FILE)
        const stimWords = STIMULUS_TEXT.toLowerCase().split(/\s+/).filter(w => w.length > 1)
        for (const word of stimWords) {
          if (!getVec(word)) allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
          awakeWords.add(word)
        }
        console.log(`  Shell stimulus: ${stimWords.length} words from conversation`)
      }
    } else {
      STIMULUS_TEXT = ''
    }

    // ─── REFRESH HUMAN INPUT ───
    if (existsSync(HUMAN_INPUT_FILE)) {
      const rawInput = readFileSync(HUMAN_INPUT_FILE, 'utf-8').trim()
      if (rawInput) {
        humanPhrases = rawInput.split('\n')
          .map(line => line.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0))
          .filter(words => words.length >= 2)
        if (humanPhrases.length > 0) {
          appendFileSync(join(BASE, 'human-input.txt.history'),
            `${new Date().toISOString()} | ${humanPhrases.map(p => p.join(' ')).join('; ')}\n`)
          unlinkSync(HUMAN_INPUT_FILE)
          for (const phrase of humanPhrases) {
            for (const word of phrase) {
              if (!getVec(word)) allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
              awakeWords.add(word)
              if (!liveVocabulary.includes(word)) {
                liveVocabulary.push(word)
                const pos = guessPOS(word)
                livePOS[pos] = livePOS[pos] || []
                livePOS[pos].push(word)
              }
              neuronFitness[word] = Math.max(neuronFitness[word] || 0, 1.5)
            }
          }
          console.log(`  Human input: ${humanPhrases.length} phrases from Galen`)
        }
      }
    }

    // ─── CONVERSATION: Read Body's champion ───
    const bodyFile = join(BASE, 'body-speaks.txt')
    if (existsSync(bodyFile)) {
      const bodyWords = readFileSync(bodyFile, 'utf-8').trim()
      if (bodyWords.length > 0) {
        const words = bodyWords.toLowerCase().split(/\s+/).filter(w => w.length > 1)
        for (const word of words) {
          if (!getVec(word)) allocVec(word, Array.from({ length: DIM }, () => (Math.random() - 0.5) * 0.5))
          awakeWords.add(word)
        }
        // Thread body's words at champion strength
        addThread(words)

        // Champion execution — body's words reshape Shell geometry (0.02 LR)
        const snapshots = new Map()
        for (const w of words) {
          const v = getVec(w)
          if (v) snapshots.set(w, Float64Array.from(v))
        }
        for (const word of words) {
          const wv = getVec(word)
          if (!wv) continue
          for (const other of words) {
            if (other === word) continue
            const ov = getVec(other)
            if (!ov) continue
            for (let k = 0; k < DIM; k++) ov[k] += wv[k] * 0.02
          }
        }

        // Entanglement — ripple through thread network (0.01 LR)
        for (const w of words) {
          const v = getVec(w)
          const snap = snapshots.get(w)
          if (!v || !snap) continue
          let deltaMag = 0
          for (let k = 0; k < DIM; k++) deltaMag += (v[k] - snap[k]) * (v[k] - snap[k])
          if (deltaMag < 1e-10) continue
          const conns = threads.get(w)
          if (!conns) continue
          const sorted = [...conns.entries()]
            .filter(([k]) => !k.startsWith('@'))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
          for (const [neighbor, strength] of sorted) {
            const nv = getVec(neighbor)
            if (!nv) continue
            const scale = 0.01 * Math.min(strength / 10, 1.0)
            for (let k = 0; k < DIM; k++) nv[k] += (v[k] - snap[k]) * scale
          }
        }

        writeFileSync(bodyFile, '')  // consumed
        console.log(`  BODY SPEAKS → Shell: ${words.slice(0, 10).join(' ')}`)
        console.log(`  GEOMETRY RESHAPED by Body`)
      }
    }

    // Reset per-session state
    allChampions.length = 0
    allPromotions.length = 0
    sessionChampionData.length = 0
    _lastInterpretation = null

    try {
      await runAllRuns()
    } catch (err) {
      console.error('SESSION ERROR:', err.message)
    }

    await new Promise(resolve => setTimeout(resolve, SESSION_GAP))
  }
}

continuousLoop().catch(err => {
  console.error('SHELL CRADLE FATAL:', err)
  shutdownPool()
  process.exit(1)
})
