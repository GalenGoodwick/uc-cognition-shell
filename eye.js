// Eye — a persistent attention stream on the shared brain
// Wakes with the Cradle, stays alive across all runs.
// Listens for work, runs tournament, reports champion, waits.
// Multiple eyes run concurrently on the same SharedArrayBuffer.

import { workerData, parentPort } from 'worker_threads'

const { sharedBuffer, initialWordIndex, dim, config, eyeId, eyeCount, eyeRole } = workerData
const brain = new Float64Array(sharedBuffer)
const { CELL_SIZE, NUM_EVALUATORS, TIERS, CANDIDATES_PER_TIER, LEARNING_RATE, DECAY, TEMPLATES } = config

// Persistent word index — grows each run as orchestrator allocates new vectors
const wordIndex = { ...initialWordIndex }

// ─── SHARED BRAIN ACCESS ───

function getVec(word) {
  const key = word.toLowerCase()
  const offset = wordIndex[key]
  if (offset === undefined) return null
  return brain.subarray(offset, offset + dim)
}

// Per-run: vectors created during this tournament (can't allocate into SharedArrayBuffer mid-run)
let newVectors = {}

function getVecOrNew(word) {
  const key = word.toLowerCase()
  const shared = getVec(key)
  if (shared) return shared
  return newVectors[key] || null
}

function createVec(word, values) {
  const key = word.toLowerCase()
  newVectors[key] = new Float64Array(values)
}

// ─── PER-RUN STATE (reset from orchestrator each run) ───
let threads, grammarNeurons, liveVocabulary, livePOS
let chunks, championHistory
let questionWords, stimulusStrength, sentenceStimulus

// ─── VECTOR MATH ───

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
  const vecs = words.map(w => getVecOrNew(w)).filter(Boolean)
  if (vecs.length === 0) return null
  const avg = new Float64Array(dim)
  for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i]
  for (let i = 0; i < dim; i++) avg[i] /= vecs.length
  return avg
}

// ─── THREADEDNESS ───

function threadedness(phraseWords) {
  const lower = phraseWords.map(w => w.toLowerCase())
  let pairs = 0, bonded = 0, totalStrength = 0
  for (let i = 0; i < lower.length; i++) {
    for (let j = i + 1; j < lower.length; j++) {
      pairs++
      let strength = threads.get(lower[i])?.get(lower[j]) || 0
      if (strength === 0) {
        const neighborsA = threads.get(lower[i])
        const neighborsB = threads.get(lower[j])
        if (neighborsA && neighborsB) {
          for (const [shared, strA] of neighborsA) {
            const strB = neighborsB.get(shared)
            if (strB) strength += Math.sqrt(strA * strB) * 0.5
          }
        }
      }
      if (strength > 0) { bonded++; totalStrength += strength }
    }
  }
  if (pairs === 0) return 0
  return (bonded / pairs) * 0.7 + Math.min(totalStrength / pairs, 1) * 0.3
}

// ─── SATURATION ───

function saturation(word) {
  const lower = word.toLowerCase()
  if (championHistory.length === 0) return 0
  const recent = championHistory.slice(-20)
  let appearances = 0
  for (const set of recent) if (set.has(lower)) appearances++
  return appearances / recent.length
}

// ─── GRAMMAR ───

function getWordPOS(word) {
  const lower = word.toLowerCase()
  if (lower.startsWith('@')) return 'grammar'
  for (const [pos, words] of Object.entries(livePOS)) {
    if (words.includes(lower)) return pos
  }
  return 'noun'
}

function pickGrammarNeuron() {
  const entries = [...grammarNeurons.entries()]
  if (entries.length === 0) return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
  const totalFitness = entries.reduce((sum, [, g]) => sum + g.fitness, 0)
  let roll = Math.random() * totalFitness
  for (const [, g] of entries) {
    roll -= g.fitness
    if (roll <= 0) return g.pattern
  }
  return entries[entries.length - 1][1].pattern
}

// ─── GENERATOR ───

function randomWord(pos) {
  const words = livePOS[pos]
  if (!words || words.length === 0) return liveVocabulary[Math.floor(Math.random() * liveVocabulary.length)]
  return words[Math.floor(Math.random() * words.length)]
}

// ─── OPERATIONS ───
// Operations are words in the vocabulary with POS "op".
// They appear in phrases, compete in tournaments, reshape via Hebbian learning.
// When an op word leads a phrase, it determines HOW the content was generated.
// Same system as everything else — no separate fitness tracking.

const OP_WORDS = new Set(['mutate', 'reverse', 'compress', 'expand', 'echo', 'negate', 'crossover', 'template'])

// ─── BASE OPERATIONS ───

function generateFromTemplate() {
  return pickGrammarNeuron().map(pos => randomWord(pos))
}

function mutatePhrase(phrase) {
  const words = [...phrase]
  const idx = Math.floor(Math.random() * words.length)
  const word = words[idx]
  if (word.includes('·')) {
    const parts = word.split('·')
    const partIdx = Math.floor(Math.random() * parts.length)
    let pos = 'noun'
    for (const [p, list] of Object.entries(livePOS)) { if (list.includes(parts[partIdx])) { pos = p; break } }
    parts[partIdx] = randomWord(pos)
    const mutated = parts.join('·')
    words[idx] = mutated
    if (!getVecOrNew(mutated)) {
      const vecs = parts.map(p => getVecOrNew(p)).filter(Boolean)
      if (vecs.length > 0) {
        const avg = new Float64Array(dim)
        for (const v of vecs) for (let k = 0; k < dim; k++) avg[k] += v[k]
        let norm = 0
        for (let k = 0; k < dim; k++) { avg[k] /= vecs.length; norm += avg[k] * avg[k] }
        norm = Math.sqrt(norm)
        if (norm > 0) for (let k = 0; k < dim; k++) avg[k] /= norm
        createVec(mutated, avg)
      }
    }
    return words
  }
  let pos = 'noun'
  for (const [p, list] of Object.entries(livePOS)) { if (list.includes(word)) { pos = p; break } }
  words[idx] = randomWord(pos)
  return words
}

function crossoverPhrases(a, b) {
  const splitA = Math.ceil(a.length / 2)
  const splitB = Math.floor(b.length / 2)
  return [...a.slice(0, splitA), ...b.slice(splitB)]
}

// ─── EMERGENT OPERATIONS ───

function reversePhrase(phrase) {
  // Flip word order — "the seed plants failure" from "failure plants the seed"
  return [...phrase].reverse()
}

function compressPhrase(phrase) {
  // Replace two adjacent words with their chunk — builds hierarchy
  if (phrase.length < 2) return [...phrase]
  const words = [...phrase]
  const idx = Math.floor(Math.random() * (words.length - 1))
  const chunkName = `${words[idx]}·${words[idx + 1]}`
  const va = getVecOrNew(words[idx]), vb = getVecOrNew(words[idx + 1])
  if (va && vb) {
    if (!getVecOrNew(chunkName)) {
      const avg = new Float64Array(dim)
      for (let k = 0; k < dim; k++) avg[k] = (va[k] + vb[k]) / 2
      let norm = 0
      for (let k = 0; k < dim; k++) norm += avg[k] * avg[k]
      norm = Math.sqrt(norm)
      if (norm > 0) for (let k = 0; k < dim; k++) avg[k] /= norm
      createVec(chunkName, avg)
    }
    words.splice(idx, 2, chunkName)
  }
  return words
}

function expandPhrase(phrase) {
  // Replace a chunk with its components — unpacks hierarchy
  const words = [...phrase]
  const chunkIdx = words.findIndex(w => w.includes('·'))
  if (chunkIdx === -1) return words
  const parts = words[chunkIdx].split('·')
  words.splice(chunkIdx, 1, ...parts)
  return words
}

function echoPhrase(phrase, previousWinners) {
  // Keep the structure, replace all content words — same skeleton, new meaning
  if (!previousWinners || previousWinners.length === 0) return generateFromTemplate()
  const source = previousWinners[Math.floor(Math.random() * previousWinners.length)]
  const words = [...source]
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w.includes('·')) continue
    let pos = 'noun'
    for (const [p, list] of Object.entries(livePOS)) { if (list.includes(w)) { pos = p; break } }
    // Only replace content words (noun, verb, adj), keep function words
    if (pos === 'noun' || pos === 'verb' || pos === 'adj') {
      words[i] = randomWord(pos)
    }
  }
  return words
}

function negatePhrase(phrase) {
  // Swap a word for its semantic opposite — find the most distant word of the same POS
  const words = [...phrase]
  const contentIdx = []
  for (let i = 0; i < words.length; i++) {
    if (words[i].includes('·')) continue
    for (const [p] of Object.entries(livePOS)) {
      if ((p === 'noun' || p === 'verb' || p === 'adj') && livePOS[p]?.includes(words[i])) {
        contentIdx.push({ idx: i, pos: p })
        break
      }
    }
  }
  if (contentIdx.length === 0) return words
  const target = contentIdx[Math.floor(Math.random() * contentIdx.length)]
  const targetVec = getVecOrNew(words[target.idx])
  if (!targetVec) { words[target.idx] = randomWord(target.pos); return words }
  // Find the most distant word of the same POS
  const candidates = livePOS[target.pos] || []
  let bestWord = null, bestDist = Infinity
  for (const w of candidates) {
    const v = getVecOrNew(w)
    if (!v) continue
    const sim = cosine(targetVec, v)
    if (sim < bestDist) { bestDist = sim; bestWord = w }
  }
  if (bestWord) words[target.idx] = bestWord
  return words
}

// ─── CANDIDATE GENERATION — grammar decides everything ───

function applyOp(opWord, previousWinners) {
  // Op word determines HOW content is generated. Returns the content (without the op word).
  const prev = previousWinners.length > 0
    ? previousWinners[Math.floor(Math.random() * previousWinners.length)]
    : null
  switch (opWord) {
    case 'crossover':
      if (previousWinners.length >= 2)
        return crossoverPhrases(
          previousWinners[Math.floor(Math.random() * previousWinners.length)],
          previousWinners[Math.floor(Math.random() * previousWinners.length)]
        )
      return null
    case 'mutate':   return prev ? mutatePhrase(prev) : null
    case 'reverse':  return prev ? reversePhrase(prev) : null
    case 'compress': return prev ? compressPhrase(prev) : null
    case 'expand':   return prev ? expandPhrase(prev) : null
    case 'echo':     return echoPhrase(null, previousWinners)
    case 'negate':   return prev ? negatePhrase(prev) : null
    default:         return null
  }
}

// Track which op birthed each candidate — metadata, not content
const candidateOps = new Map()

function generateCandidates(count, previousWinners = []) {
  const candidates = []
  for (let i = 0; i < count; i++) {
    let candidate

    if (eyeRole === 'pattern') {
      // Pattern eye: ALL candidates come from operations
      const ops = [...OP_WORDS]
      const opWord = ops[Math.floor(Math.random() * ops.length)]
      const content = applyOp(opWord, previousWinners)
      if (content && content.length > 0) {
        candidate = content
      } else {
        // Op needs previous winners — fall back to template
        candidate = pickGrammarNeuron().map(pos => randomWord(pos))
      }
      candidateOps.set(candidate, opWord)
    } else {
      const pattern = pickGrammarNeuron()
      if (pattern[0] === 'op') {
        // Op-led pattern: pick an op word, use it to generate content
        const opWord = randomWord('op')
        const content = applyOp(opWord, previousWinners)
        if (content && content.length > 0) {
          candidate = content
        } else {
          candidate = pattern.slice(1).map(pos => randomWord(pos))
        }
        candidateOps.set(candidate, opWord)
      } else {
        candidate = pattern.map(pos => randomWord(pos))
      }
    }

    candidates.push(candidate)
  }
  return candidates
}

// ─── EVALUATORS ───

function pickEvaluators(count, excludeWords = [], survivorWords = []) {
  // Pattern eye: ops are the evaluators — they judge their own output
  if (eyeRole === 'pattern') {
    const ops = [...OP_WORDS].filter(w => getVecOrNew(w))
    const shuffled = ops.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(count, shuffled.length))
  }

  // Evaluators are the most CONNECTED words, not the loudest.
  // Thread connectivity = total bond strength across all connections.
  // A word deeply embedded in the relational landscape judges better
  // than a pronoun that won by being geometrically central.
  const excludeSet = new Set(excludeWords.map(w => w.toLowerCase()))
  const candidates = liveVocabulary
    .filter(w => !excludeSet.has(w) && w.length > 2 && !w.includes('·') && !w.startsWith('@') && getVecOrNew(w))

  // Rank by thread connectivity — total strength of all bonds
  const ranked = candidates.map(w => {
    const conns = threads.get(w)
    let connectivity = 0
    let bondCount = 0
    if (conns) {
      for (const [, strength] of conns) {
        connectivity += strength
        bondCount++
      }
    }
    return { word: w, connectivity, bondCount }
  })
    .filter(e => e.bondCount >= 2)  // must have at least 2 bonds
    .sort((a, b) => b.connectivity - a.connectivity)

  // Pick from top connected, with some randomness to avoid rigidity
  const topPool = ranked.slice(0, Math.max(count * 4, 20))
  const picked = []
  const used = new Set()
  const shuffled = topPool.sort(() => Math.random() - 0.5)
  for (const entry of shuffled) {
    if (picked.length >= count) break
    if (!used.has(entry.word)) {
      used.add(entry.word)
      picked.push(entry.word)
    }
  }

  // Fallback if not enough threaded words
  if (picked.length < count) {
    const fallback = candidates.filter(w => !used.has(w))
    for (const w of fallback) {
      if (picked.length >= count) break
      picked.push(w)
    }
  }
  return picked
}

function championFatigue(phraseWords) {
  // How tired is this phrase? Recent champions fatigue; absence restores.
  // Look at last 20 champions. Each match adds fatigue, but older matches fade.
  if (!championHistory || championHistory.length === 0) return 0
  const lower = new Set(phraseWords.map(w => w.toLowerCase()))
  const window = championHistory.slice(-20)
  let fatigue = 0
  for (let i = 0; i < window.length; i++) {
    const recency = (i + 1) / window.length  // 0→old, 1→recent
    const champ = window[i]
    // Overlap: what fraction of this phrase's words appeared in that champion?
    let overlap = 0
    for (const w of lower) if (champ.has(w)) overlap++
    const overlapRatio = overlap / lower.size
    if (overlapRatio > 0.6) {
      fatigue += overlapRatio * recency  // recent + high overlap = more fatigue
    }
  }
  return Math.min(fatigue / 5, 0.3)  // cap at 0.3 — tired, not dead
}

function evaluatorScore(evaluatorWord, phraseWords) {
  const evalVec = getVecOrNew(evaluatorWord)
  const pVec = phraseVec(phraseWords)
  if (!evalVec || !pVec) return 0
  const proximity = cosine(evalVec, pVec)
  let structure = 0
  const unique = new Set(phraseWords.map(w => w.toLowerCase()))
  structure += (unique.size / phraseWords.length) * 0.15
  if (phraseWords.some(w => livePOS.verb?.includes(w))) structure += 0.1
  if (phraseWords.some(w => livePOS.noun?.includes(w))) structure += 0.05
  structure += Math.min(phraseWords.length / 8, 0.1)
  const memory = threadedness(phraseWords)
  const avgSaturation = phraseWords.reduce((sum, w) => sum + saturation(w), 0) / phraseWords.length
  const novelty = 1 - avgSaturation
  const fatigue = championFatigue(phraseWords)
  const raw = proximity * 0.4 + structure * 0.25 + memory * 0.2 + novelty * 0.15
  return raw * (1 - fatigue)
}

// ─── CELL ───

function runCell(candidates, survivorWords = []) {
  const allWords = candidates.flatMap(c => c)
  const evaluators = pickEvaluators(NUM_EVALUATORS, allWords, survivorWords)
  const candidateScores = candidates.map(phrase => ({
    phrase,
    scores: evaluators.map(ev => evaluatorScore(ev, phrase)),
    totalScore: 0,
    votes: 0,
  }))
  for (const cs of candidateScores) cs.totalScore = cs.scores.reduce((a, b) => a + b, 0)
  const votes = []
  for (let e = 0; e < evaluators.length; e++) {
    let bestIdx = 0, bestScore = -Infinity
    for (let c = 0; c < candidateScores.length; c++) {
      if (candidateScores[c].scores[e] > bestScore) { bestScore = candidateScores[c].scores[e]; bestIdx = c }
    }
    candidateScores[bestIdx].votes++
    votes.push({ evaluator: evaluators[e], votedFor: bestIdx })
  }
  candidateScores.sort((a, b) => b.votes !== a.votes ? b.votes - a.votes : b.totalScore - a.totalScore)
  return { winner: candidateScores[0], losers: candidateScores.slice(1), evaluators, votes }
}

// ─── TIER ───

function runTier(candidates, tierNum, survivorWords = []) {
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const winners = []
  const allResults = []
  for (let i = 0; i < shuffled.length; i += CELL_SIZE) {
    const cellCandidates = shuffled.slice(i, i + CELL_SIZE)
    if (cellCandidates.length < 2) continue
    const result = runCell(cellCandidates, survivorWords)
    winners.push(result.winner.phrase)
    allResults.push(result)
  }
  return { winners, cells: allResults }
}

// ─── RESHAPE — writes directly to shared brain ───

function reshapeEmbeddings(cellResults, tierNum) {
  // Learning rate scaled by eye count — 10 eyes each drift at lr/10 = same total as 1 eye at lr
  const lr = (LEARNING_RATE / eyeCount) * Math.pow(DECAY, tierNum - 1)
  for (const cell of cellResults) {
    const winnerWords = cell.winner.phrase
    const loserWords = cell.losers.flatMap(l => l.phrase)
    // Hebbian: pull winners together
    for (let i = 0; i < winnerWords.length; i++) {
      for (let j = i + 1; j < winnerWords.length; j++) {
        const va = getVecOrNew(winnerWords[i])
        const vb = getVecOrNew(winnerWords[j])
        if (!va || !vb) continue
        for (let k = 0; k < dim; k++) {
          const diff = vb[k] - va[k]
          va[k] += diff * lr
          vb[k] -= diff * lr
        }
      }
    }
    // Lateral inhibition
    for (const ww of winnerWords) {
      for (const lw of loserWords) {
        const va = getVecOrNew(ww)
        const vb = getVecOrNew(lw)
        if (!va || !vb) continue
        for (let k = 0; k < dim; k++) va[k] -= (vb[k] - va[k]) * lr * 0.2
      }
    }
    // Evaluator drift
    for (const vote of cell.votes) {
      const evalVec = getVecOrNew(vote.evaluator)
      const winVec = phraseVec(winnerWords)
      if (!evalVec || !winVec) continue
      for (let k = 0; k < dim; k++) evalVec[k] += (winVec[k] - evalVec[k]) * lr * 0.3
    }
    // NO normalization here — orchestrator normalizes between runs (single-threaded, no race)
  }
}

// ─── TOURNAMENT ───

function runTournament() {
  // Q eye: boost question threads
  if (questionWords && questionWords.length > 0) {
    const lower = questionWords.map(w => w.toLowerCase())
    for (let i = 0; i < lower.length; i++) {
      for (let j = i + 1; j < lower.length; j++) {
        const a = lower[i], b = lower[j]
        if (a === b) continue
        if (!threads.has(a)) threads.set(a, new Map())
        if (!threads.has(b)) threads.set(b, new Map())
        threads.get(a).set(b, (threads.get(a).get(b) || 0) + stimulusStrength)
        threads.get(b).set(a, (threads.get(b).get(a) || 0) + stimulusStrength)
      }
    }
  }

  // Corpus words enter as neurons + threads, but candidates are GENERATED.
  // The brain learns vocabulary from the corpus but must reconstruct meaning.
  let candidates
  if (sentenceStimulus && sentenceStimulus.length > 0) {
    // Wake corpus words as neurons
    const allWords = new Set(sentenceStimulus.flat())
    for (const word of allWords) {
      if (getVecOrNew(word) && !liveVocabulary.includes(word)) {
        liveVocabulary.push(word)
        livePOS['noun'] = livePOS['noun'] || []
        if (!livePOS['noun'].includes(word)) livePOS['noun'].push(word)
      }
    }
    // Thread corpus co-occurrence — words that appear together get weak bonds
    for (const sentence of sentenceStimulus) {
      const valid = sentence.filter(w => getVecOrNew(w))
      for (let i = 0; i < valid.length; i++) {
        for (let j = i + 1; j < Math.min(i + 3, valid.length); j++) {
          const a = valid[i], b = valid[j]
          if (a === b) continue
          if (!threads.has(a)) threads.set(a, new Map())
          if (!threads.has(b)) threads.set(b, new Map())
          threads.get(a).set(b, (threads.get(a).get(b) || 0) + 0.1)
          threads.get(b).set(a, (threads.get(b).get(a) || 0) + 0.1)
        }
      }
    }
  }
  // Candidates always generated — reconstructed from geometry, never memorized
  candidates = generateCandidates(CANDIDATES_PER_TIER)

  let allWinners = []
  let survivorWords = []
  const newChunks = []
  const CHUNK_MIN_TIER = Math.ceil(TIERS * 0.25)

  for (let tier = 1; tier <= TIERS; tier++) {
    if (candidates.length < 2) break
    const { winners, cells } = runTier(candidates, tier, survivorWords)
    survivorWords = [...new Set(winners.flatMap(w => w))]

    // ─── A/B TEST: CHUNKING DISABLED ───
    // No chunking — words stay as words, never fuse into frozen units.
    // The champion is a sequence of individual words, reconstructed each time.

    reshapeEmbeddings(cells, tier)
    allWinners = winners
    if (winners.length <= 1) break

    const injected = Math.max(0, Math.floor(winners.length * Math.pow(0.5, tier - 1)))
    const challengers = generateCandidates(injected, winners)
    candidates = [...winners, ...challengers]
  }

  const champion = allWinners.length > 0 ? allWinners[0] : null
  const championOp = champion ? (candidateOps.get(champion) || null) : null
  return { champion, newChunks, championOp }
}

// ─── MESSAGE LOOP — shader pattern ───
// Uniforms arrive once per session (shared state).
// Runs arrive per-run with only stimulus (varyings).

parentPort.on('message', (msg) => {
  if (msg.type === 'uniforms') {
    // Shared state — same for all eyes, sent once per session
    chunks = new Set(msg.chunksArr)
    liveVocabulary = [...msg.vocabularyArr]
    livePOS = {}
    for (const [pos, words] of Object.entries(msg.posData)) livePOS[pos] = [...words]
    threads = new Map()
    for (const [word, neighbors] of Object.entries(msg.threadsData))
      threads.set(word, new Map(Object.entries(neighbors).map(([k, v]) => [k, Number(v)])))
    grammarNeurons = new Map()
    for (const [key, g] of Object.entries(msg.grammarData))
      grammarNeurons.set(key, { pattern: g.pattern, fitness: g.fitness, wins: g.wins })
    championHistory = (msg.championHistory || []).map(a => new Set(a))
    stimulusStrength = msg.stimulusStrength
  } else if (msg.type === 'run') {
    const runId = msg.runId

    // Merge word index delta
    if (msg.newWordEntries) Object.assign(wordIndex, msg.newWordEntries)

    // Per-run varyings — only stimulus differs
    newVectors = {}
    questionWords = msg.questionWords
    sentenceStimulus = msg.sentenceStimulus

    // Run tournament
    const result = runTournament()

    // Report
    parentPort.postMessage({
      eyeId,
      runId,
      champion: result.champion,
      newChunks: result.newChunks,
      championOp: result.championOp,
      newVectors: Object.fromEntries(
        Object.entries(newVectors).map(([k, v]) => [k, Array.from(v)])
      ),
    })
  } else if (msg.type === 'shutdown') {
    process.exit(0)
  }
})
