// Corpus Callosum — Geometric Cluster Synthesis
//
// No LLM. No POS tags. No templates.
// The brain's vector space has natural clusters.
// Find them. Trace the waveform through them.
//
// Architecture:
//   0. extend: build extended vectors (GloVe + Cradle's own dimensions)
//   1. clusterize: k-means on extended vectors → cluster centroids
//   2. entangle: measure thread bonds between clusters (aggregate thread strength)
//   3. nebula: map probability clouds in transition zones between clusters
//   4. waveform: trace path through clusters via entanglement from eye origins
//   5. sample: pick one word per cluster along the path (nebula gap filling)
//   6. interpret: LLM translates geometry → language (both shown)
//   7. thread: Hebbian learning from the synthesis
//
// Dimensions:
//   - 50 GloVe (inherited semantic foundation)
//   - 1 fitness (tournament survival)
//   - 1 wave reach (distributed across N clusters)
//   - 1 thread connectivity (total entanglement strength)
//   - 8 grammar POS (one-hot: det/noun/verb/adj/adv/prep/conj/pron)
//   - N thread bonds (bond strength to top N threaded words)
//   Each neuron IS a dimension. The Cradle builds its own coordinate system.

const SYNTHESIS_THREAD_STRENGTH = 0.3
const K = 12                    // number of clusters
const KMEANS_ITERATIONS = 15    // convergence steps
const MAX_WORDS_PER_CLUSTER = 500  // cap for performance
const MIN_CLUSTER_SIZE = 5
const THREAD_DIM_CAP = 0        // paused — sparse thread dims dilute GloVe signal
const CRADLE_WEIGHT = 0.7       // how much Cradle dimensions contribute vs GloVe


// ─── GEOMETRY ───

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

function geometricMean(values) {
  if (values.length === 0) return 0
  let logSum = 0
  for (const v of values) {
    if (v <= 0) return 0
    logSum += Math.log(v)
  }
  return Math.exp(logSum / values.length)
}

function vecAdd(a, b) {
  const r = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) r[i] = a[i] + b[i]
  return r
}

function vecScale(a, s) {
  const r = new Float64Array(a.length)
  for (let i = 0; i < a.length; i++) r[i] = a[i] * s
  return r
}


// ─── EXTENDED VECTORS ───
// Each word gets a vector in the Cradle's own coordinate system.
// GloVe provides 50 semantic dimensions. The Cradle adds its own:
//   - fitness, wave reach, thread connectivity (3 experiential dims)
//   - POS one-hot (8 grammar dims)
//   - thread bonds to top N words (N relational dims)
// Every neuron that threads becomes a dimension axis.
// More sessions = more dimensions = richer geometry.

const POS_MAP = { det: 0, noun: 1, verb: 2, adj: 3, adv: 4, prep: 5, conj: 6, pron: 7 }
const POS_DIMS = 8

function buildExtendedVectors(neuronFitness, threads, getVecFn, waveNeurons, getWordPOS, synthesisDims) {
  // Determine thread dimension axes: top N most connected words
  const threadTotals = []
  for (const [word, conns] of threads) {
    let total = 0
    for (const [, s] of conns) total += s
    threadTotals.push({ word, total })
  }
  threadTotals.sort((a, b) => b.total - a.total)
  const threadAxes = threadTotals.slice(0, THREAD_DIM_CAP)
  const threadIndex = new Map()
  threadAxes.forEach((t, i) => threadIndex.set(t.word, i))

  // Normalization constants
  let maxStrength = 1
  for (const [, conns] of threads) {
    for (const [, s] of conns) if (s > maxStrength) maxStrength = s
  }

  // Wave neuron lookup
  const waveMap = new Map()
  const maxReach = waveNeurons ? Math.max(1, ...waveNeurons.map(wn => wn.reach)) : 1
  if (waveNeurons) {
    for (const wn of waveNeurons) waveMap.set(wn.word, wn)
  }

  // Synthesis dimensions: previous outputs become coordinate axes.
  // The output of the system IS a dimension of the system. Fractal.
  // Each past synthesis is a vector. Each word's proximity to that synthesis
  // is a coordinate. The system positions itself relative to its own history.
  const synthAxes = synthesisDims || []
  const synthCount = Math.min(synthAxes.length, 20)  // cap at 20 recent syntheses

  // Dimensions: 50 GloVe + 3 experiential + 8 POS + N thread bonds + M synthesis
  const baseDim = 50
  const cradleDims = 3 + POS_DIMS + threadAxes.length + synthCount
  const totalDim = baseDim + cradleDims

  // Weight factor: scale Cradle dims so they contribute proportionally
  const weight = CRADLE_WEIGHT * Math.sqrt(baseDim / Math.max(1, cradleDims))

  const extVecs = new Map()

  for (const word of Object.keys(neuronFitness)) {
    const baseVec = getVecFn(word)
    if (!baseVec) continue

    const ext = new Float64Array(totalDim)

    // GloVe dimensions (as-is)
    for (let d = 0; d < baseDim && d < baseVec.length; d++) ext[d] = baseVec[d]

    let offset = baseDim

    // Fitness (0-1)
    ext[offset++] = (neuronFitness[word] || 0) * weight

    // Wave reach (0-1 normalized)
    const wave = waveMap.get(word)
    ext[offset++] = (wave ? wave.reach / maxReach : 0) * weight

    // Thread connectivity (total strength, normalized)
    const conns = threads.get(word)
    let totalConn = 0
    if (conns) {
      for (const [, s] of conns) totalConn += s
    }
    ext[offset++] = Math.min(totalConn / (maxStrength * 3), 1) * weight

    // Grammar POS one-hot
    const pos = getWordPOS ? getWordPOS(word) : null
    if (pos && POS_MAP[pos] !== undefined) {
      ext[offset + POS_MAP[pos]] = 1 * weight
    }
    offset += POS_DIMS

    // Thread bond dimensions: relationship to each axis word
    if (conns) {
      for (const [target, strength] of conns) {
        const idx = threadIndex.get(target)
        if (idx !== undefined) {
          ext[offset + idx] = (strength / maxStrength) * weight
        }
      }
    }
    offset += threadAxes.length

    // Synthesis dimensions: proximity to each past synthesis vector.
    // The fractal loop: output → dimension → input → output.
    // Each word is positioned relative to what the system previously said.
    for (let si = 0; si < synthCount; si++) {
      const synthVec = synthAxes[synthAxes.length - synthCount + si]
      if (synthVec) {
        // Cosine similarity to this past synthesis (normalized 0-1)
        const sim = (cosine(baseVec, synthVec) + 1) / 2
        ext[offset + si] = sim * weight
      }
    }

    extVecs.set(word, ext)
  }

  console.log(`  CALLOSUM: extended vectors — ${totalDim}D (${baseDim} GloVe + ${cradleDims} Cradle [${threadAxes.length} thread, ${POS_DIMS} grammar, 3 experiential, ${synthCount} synthesis])`)

  return { extVecs, totalDim, cradleDims, threadDims: threadAxes.length, synthDims: synthCount }
}


// ─── MAP EYES ───

function mapEyes(sessionChampions, phraseVecFn) {
  const eyePhrases = new Map()
  for (const champ of sessionChampions) {
    const text = champ.text.trim()
    if (!text) continue
    if (!eyePhrases.has(champ.eye)) eyePhrases.set(champ.eye, [])
    eyePhrases.get(champ.eye).push(text)
  }

  const eyeCentroids = new Map()
  for (const [eye, phrases] of eyePhrases) {
    const vecs = phrases
      .map(p => phraseVecFn(p.toLowerCase().split(/[\s·]+/).filter(w => w.length > 1)))
      .filter(Boolean)
    if (vecs.length === 0) continue
    const dim = vecs[0].length
    const avg = new Float64Array(dim)
    for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i]
    for (let i = 0; i < dim; i++) avg[i] /= vecs.length
    eyeCentroids.set(eye, avg)
  }

  return { eyePhrases, eyeCentroids }
}


// ─── PERSISTENT STATE ───
// Clusters persist across sessions. They slowly reshape as the brain changes.
// Synthesis vectors persist too — the fractal loop. Each output becomes a dimension.

let clusters = null  // array of { centroid, words: [], id }
let synthesisDimVecs = []  // PAUSED — no new synthesis dims, run on 61D


// ─── K-MEANS CLUSTERING ───
// Cluster the brain's active words by vector proximity.

function clusterize(neuronFitness, getVecFn, dim) {
  // Collect words with vectors — prioritize high-fitness words
  const allWords = Object.keys(neuronFitness)
    .filter(w => w.length > 1 && !w.startsWith('@') && !w.includes('·'))

  // Sort by fitness, take top words for clustering (performance)
  const sorted = allWords
    .map(w => ({ word: w, fitness: neuronFitness[w] || 0, vec: getVecFn(w) }))
    .filter(e => e.vec)
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, K * MAX_WORDS_PER_CLUSTER)

  if (sorted.length < K * MIN_CLUSTER_SIZE) return null

  // Initialize centroids — pick K words spread across fitness range
  const step = Math.floor(sorted.length / K)
  let centroids = []
  for (let i = 0; i < K; i++) {
    centroids.push(Float64Array.from(sorted[i * step].vec))
  }

  // K-means iterations
  let assignments = new Array(sorted.length).fill(0)

  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    // Assign each word to nearest centroid
    for (let w = 0; w < sorted.length; w++) {
      let bestCluster = 0, bestSim = -Infinity
      for (let c = 0; c < K; c++) {
        const sim = cosine(sorted[w].vec, centroids[c])
        if (sim > bestSim) { bestSim = sim; bestCluster = c }
      }
      assignments[w] = bestCluster
    }

    // Recompute centroids
    const newCentroids = Array.from({ length: K }, () => new Float64Array(dim))
    const counts = new Array(K).fill(0)

    for (let w = 0; w < sorted.length; w++) {
      const c = assignments[w]
      counts[c]++
      for (let d = 0; d < dim; d++) newCentroids[c][d] += sorted[w].vec[d]
    }

    for (let c = 0; c < K; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) newCentroids[c][d] /= counts[c]
      }
    }

    centroids = newCentroids
  }

  // Build cluster objects
  const result = centroids.map((centroid, id) => ({
    id,
    centroid,
    words: [],
    size: 0,
  }))

  for (let w = 0; w < sorted.length; w++) {
    const c = assignments[w]
    result[c].words.push(sorted[w].word)
    result[c].size++
  }

  // Filter out empty or tiny clusters
  return result.filter(c => c.size >= MIN_CLUSTER_SIZE)
}


// ─── UPDATE CLUSTERS ───
// If clusters exist, gently move centroids rather than full recompute.
// The clusters learn over sessions.

function updateClusters(existingClusters, neuronFitness, getVecFn, dim) {
  const lr = 0.3  // how fast clusters adapt

  // Reassign words to nearest cluster
  const allWords = Object.keys(neuronFitness)
    .filter(w => w.length > 1 && !w.startsWith('@') && !w.includes('·'))
    .map(w => ({ word: w, fitness: neuronFitness[w] || 0, vec: getVecFn(w) }))
    .filter(e => e.vec)
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, K * MAX_WORDS_PER_CLUSTER)

  // Clear and reassign
  for (const cluster of existingClusters) cluster.words = []

  for (const entry of allWords) {
    let bestCluster = existingClusters[0], bestSim = -Infinity
    for (const cluster of existingClusters) {
      const sim = cosine(entry.vec, cluster.centroid)
      if (sim > bestSim) { bestSim = sim; bestCluster = cluster }
    }
    bestCluster.words.push(entry.word)
  }

  // Move centroids toward their new members
  for (const cluster of existingClusters) {
    if (cluster.words.length === 0) continue
    const newCentroid = new Float64Array(dim)
    let count = 0
    for (const word of cluster.words) {
      const vec = getVecFn(word)
      if (!vec) continue
      for (let d = 0; d < dim; d++) newCentroid[d] += vec[d]
      count++
    }
    if (count > 0) {
      for (let d = 0; d < dim; d++) {
        newCentroid[d] /= count
        cluster.centroid[d] += (newCentroid[d] - cluster.centroid[d]) * lr
      }
    }
    cluster.size = cluster.words.length
  }

  return existingClusters.filter(c => c.size >= MIN_CLUSTER_SIZE)
}


// ─── WAVE NEURONS ───
// Some words aren't points — they're waves across the space.
// High-connectivity words (many thread bonds across clusters) get duplicated
// into every cluster they're entangled with. At drop-off points in the waveform,
// these neurons are available as bridge picks.
//
// A word becomes a wave when:
//   - It has thread bonds to words in 3+ different clusters
//   - Or it has very high total thread strength (top 5%)
//
// Wave neurons smooth transitions. "the", "and", "is" — the connective tissue
// that holds sentences together — naturally qualify.

function identifyWaveNeurons(clusters, threads) {
  // Build reverse index: word → which cluster(s) it belongs to
  const wordCluster = new Map()  // word → primary cluster index
  for (let ci = 0; ci < clusters.length; ci++) {
    for (const word of clusters[ci].words) {
      wordCluster.set(word, ci)
    }
  }

  // For each threaded word, count how many DIFFERENT clusters it bonds to
  const waveNeurons = []

  for (const [word, conns] of threads) {
    if (!wordCluster.has(word)) continue  // not in any cluster
    const primaryCluster = wordCluster.get(word)

    // Count distinct clusters this word bonds to
    const bondedClusters = new Set()
    let totalStrength = 0

    for (const [target, strength] of conns) {
      const targetCluster = wordCluster.get(target)
      if (targetCluster !== undefined && targetCluster !== primaryCluster) {
        bondedClusters.add(targetCluster)
        totalStrength += strength
      }
    }

    // Wave threshold: bonds to 3+ clusters, or very high total bond strength
    if (bondedClusters.size >= 3 || totalStrength > 5.0) {
      waveNeurons.push({
        word,
        primaryCluster,
        bondedClusters: [...bondedClusters],
        totalStrength,
        reach: bondedClusters.size,
      })
    }
  }

  // Duplicate wave neurons into their bonded clusters
  let duplications = 0
  for (const wn of waveNeurons) {
    for (const ci of wn.bondedClusters) {
      if (!clusters[ci].words.includes(wn.word)) {
        clusters[ci].words.push(wn.word)
        duplications++
      }
    }
  }

  if (waveNeurons.length > 0) {
    console.log(`  CALLOSUM: ${waveNeurons.length} wave neurons identified, ${duplications} duplications across clusters`)
    // Show top 5 by reach
    waveNeurons.sort((a, b) => b.reach - a.reach)
    for (const wn of waveNeurons.slice(0, 5)) {
      console.log(`    "${wn.word}" — wave across ${wn.reach + 1} clusters (strength: ${wn.totalStrength.toFixed(2)})`)
    }
  }

  return waveNeurons
}


// ─── PROBABILITY NEBULAS ───
// Words that live in the transition zones between clusters.
// Not firmly in either cluster — distributed in probability clouds.
// These give the inter-cluster space its topology.
//
// Without nebulas, gap sampling queries a flat midpoint in empty space.
// With nebulas, we map the actual probability density between clusters.
// The gap space isn't empty — words already live there, irregularly distributed.
// We just weren't seeing them.
//
// A nebula word:
//   - Has moderate similarity to BOTH adjacent clusters
//   - Is relatively balanced (not strongly pulled to one side)
//   - Exists in the cloud, not at a point

function mapNebulas(clusters, getVecFn, neuronFitness) {
  const nebulas = new Map()  // "i-j" → [{ word, balance, density, fitness }]

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const candidates = []

      // Check words in both clusters for nebula membership
      const pool = new Set([...clusters[i].words.slice(0, 100), ...clusters[j].words.slice(0, 100)])

      for (const word of pool) {
        const vec = getVecFn(word)
        if (!vec) continue

        const simI = (cosine(vec, clusters[i].centroid) + 1) / 2
        const simJ = (cosine(vec, clusters[j].centroid) + 1) / 2

        // Balance: 1.0 = equidistant from both clusters, 0.0 = firmly in one
        const balance = 1 - Math.abs(simI - simJ)
        // Density: minimum proximity to either cluster (must be close to both)
        const density = Math.min(simI, simJ)

        // Nebula test: reasonably close to both and not strongly pulled to one side
        if (density > 0.35 && balance > 0.4) {
          candidates.push({
            word,
            balance,
            density,
            fitness: neuronFitness[word] || 0,
            // Nebula score: balanced position weighted by density
            score: balance * 0.5 + density * 0.3 + (neuronFitness[word] || 0) * 0.2,
          })
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score)
        nebulas.set(`${i}-${j}`, candidates.slice(0, 30))
        nebulas.set(`${j}-${i}`, candidates.slice(0, 30))  // symmetric access
      }
    }
  }

  // Log nebula topology
  let totalNebula = 0
  const uniqueKeys = new Set()
  for (const [key, words] of nebulas) {
    const [a, b] = key.split('-').map(Number)
    if (a < b) {
      uniqueKeys.add(key)
      totalNebula += words.length
    }
  }
  if (uniqueKeys.size > 0) {
    console.log(`  CALLOSUM: ${uniqueKeys.size} nebulas mapped, ${totalNebula} transition words`)
    // Show densest nebulas
    const sorted = [...uniqueKeys].map(k => ({ key: k, count: nebulas.get(k).length }))
      .sort((a, b) => b.count - a.count)
    for (const n of sorted.slice(0, 3)) {
      const words = nebulas.get(n.key).slice(0, 5).map(w => w.word)
      console.log(`    nebula c${n.key}: ${n.count} words (${words.join(', ')}...)`)
    }
  }

  return nebulas
}


// ─── CLUSTER ENTANGLEMENT ───
// Aggregate thread strength between cluster pairs.
// This is the "quantum" bond — zero-distance connections between distant clusters.

function computeEntanglement(clusters, threads) {
  const n = clusters.length
  const entanglement = Array.from({ length: n }, () => new Float64Array(n))

  // For performance: only sample top words from each cluster
  const SAMPLE = 50

  for (let i = 0; i < n; i++) {
    const wordsI = clusters[i].words.slice(0, SAMPLE)
    for (let j = i + 1; j < n; j++) {
      const wordsJ = clusters[j].words.slice(0, SAMPLE)
      let totalStrength = 0
      let bonds = 0

      for (const wi of wordsI) {
        const conns = threads.get(wi)
        if (!conns) continue
        for (const wj of wordsJ) {
          const strength = conns.get(wj)
          if (strength) {
            totalStrength += strength
            bonds++
          }
        }
      }

      // Normalize by possible connections
      const normalized = bonds > 0 ? totalStrength / Math.sqrt(wordsI.length * wordsJ.length) : 0
      entanglement[i][j] = normalized
      entanglement[j][i] = normalized
    }
  }

  return entanglement
}


// ─── TRACE WAVEFORM ───
// Dual-force path through clusters.
// Force 1: GEOMETRIC PROXIMITY — cosine distance between cluster centroids (spatial)
// Force 2: THREAD ENTANGLEMENT — aggregate bond strength between clusters (quantum)
// Both forces score every hop. Neither alone is sufficient.

// Extract GloVe portion (first 50 dims) from an extended vector
function gloveSlice(extVec) {
  if (!extVec || extVec.length <= 50) return extVec
  return extVec.slice(0, 50)
}

function traceWaveform(clusters, entanglement, eyeCentroids, getVecFn, neuronFitness) {
  const visited = new Set()
  const path = []       // cluster indices
  const hopForces = []  // { geo, ent, combined } per hop — for diagnostics

  // Start from the cluster closest to the combined eye centroid (origin)
  // Eye centroids are in GloVe space (50D). Cluster centroids may be extended.
  // Compare using GloVe portion only.
  const centroids = [...eyeCentroids.values()]
  const eyeDim = centroids[0]?.length || 50
  const origin = new Float64Array(eyeDim)
  for (const c of centroids) for (let d = 0; d < eyeDim; d++) origin[d] += c[d]
  for (let d = 0; d < eyeDim; d++) origin[d] /= centroids.length

  let bestStart = 0, bestSim = -Infinity
  for (let i = 0; i < clusters.length; i++) {
    const clusterGlove = gloveSlice(clusters[i].centroid)
    const sim = cosine(clusterGlove, origin)
    if (sim > bestSim) { bestSim = sim; bestStart = i }
  }

  visited.add(bestStart)
  path.push(bestStart)

  const maxSteps = Math.min(clusters.length - 1, 8)

  for (let step = 0; step < maxSteps; step++) {
    const current = path[path.length - 1]

    // Which eye is least covered by current path?
    // Compare in GloVe space (eyes don't have Cradle dimensions)
    let leastCoveredCentroid = null
    let minCov = Infinity
    const pathGlove = new Float64Array(eyeDim)
    for (const ci of path) {
      const cg = gloveSlice(clusters[ci].centroid)
      for (let d = 0; d < eyeDim; d++) pathGlove[d] += cg[d]
    }
    for (let d = 0; d < eyeDim; d++) pathGlove[d] /= path.length

    for (const [, centroid] of eyeCentroids) {
      const cov = cosine(pathGlove, centroid)
      if (cov < minCov) { minCov = cov; leastCoveredCentroid = centroid }
    }

    // Score each unvisited cluster with BOTH forces
    let bestNext = -1, bestScore = -Infinity
    let bestGeo = 0, bestEnt = 0

    for (let j = 0; j < clusters.length; j++) {
      if (visited.has(j)) continue

      // Force 1: GEOMETRIC PROXIMITY — how close in vector space?
      const geo = (cosine(clusters[current].centroid, clusters[j].centroid) + 1) / 2  // normalize to 0-1

      // Force 2: THREAD ENTANGLEMENT — how bonded through experience?
      const ent = entanglement[current][j]

      // Either force can pull — don't require both
      if (geo < 0.1 && ent === 0) continue

      // Eye pull — bias toward least-covered perspective
      // Compare in GloVe space (eye centroids are 50D)
      let eyePull = 0.5
      if (leastCoveredCentroid) {
        eyePull = Math.max(0.1, (cosine(gloveSlice(clusters[j].centroid), leastCoveredCentroid) + 1) / 2)
      }

      // Dual-force score: geometric proximity + quantum entanglement
      // Entanglement amplifies spatial proximity. Proximity provides a floor.
      const spatialScore = geo * 0.4           // spatial pull (always present)
      const quantumScore = ent * 0.6           // quantum pull (learned bonds)
      const score = (spatialScore + quantumScore) * (1 + eyePull)

      if (score > bestScore) {
        bestScore = score
        bestNext = j
        bestGeo = geo
        bestEnt = ent
      }
    }

    if (bestNext === -1) break
    visited.add(bestNext)
    path.push(bestNext)
    hopForces.push({ geo: bestGeo, ent: bestEnt, combined: bestScore })
  }

  return { path, hopForces }
}


// ─── SAMPLE WORDS FROM PATH ───
// Pick one word per cluster along the waveform.
// Triple-force word selection:
//   Force 1: GEOMETRIC PROXIMITY — cosine similarity to previous word's vector
//   Force 2: THREAD ENTANGLEMENT — learned bond strength to previous word
//   Force 3: GRAMMAR FLOW — POS transition preference (soft bias, not hard constraint)
// Each neuron is aware of its spatial position, relational bonds, AND grammatical role.

// POS transition preferences — what POS naturally follows what
// Not templates. Just the gravitational pull of grammar.
const POS_FLOW = {
  pron:  { verb: 0.4, adv: 0.2 },                    // "who runs", "who also"
  det:   { noun: 0.5, adj: 0.3 },                     // "the light", "the bright"
  noun:  { verb: 0.3, prep: 0.2, conj: 0.15 },        // "light fades", "light of", "light and"
  verb:  { noun: 0.3, adj: 0.2, adv: 0.2, det: 0.15 },// "builds truth", "grows bright", "runs fast"
  adj:   { noun: 0.4, conj: 0.15 },                   // "bright light", "bright and"
  adv:   { verb: 0.4, adj: 0.2 },                     // "also builds", "very bright"
  prep:  { det: 0.3, noun: 0.3, pron: 0.2 },          // "of the", "of light", "of whom"
  conj:  { pron: 0.2, det: 0.2, noun: 0.2, adj: 0.15 }, // "and who", "and the", "and light"
}

function samplePath(path, clusters, threads, getVecFn, neuronFitness, waveNeurons, allWords, nebulas, getWordPOS) {
  const words = []
  const wordForces = []  // { word, geo, ent, wave, gap } per word — diagnostics
  let prevWord = null
  let prevClusterIdx = null

  // Build set of wave neuron words for fast lookup
  const waveWords = new Set(waveNeurons ? waveNeurons.map(wn => wn.word) : [])

  for (let pathStep = 0; pathStep < path.length; pathStep++) {
    const clusterIdx = path[pathStep]
    const cluster = clusters[clusterIdx]
    if (cluster.words.length === 0) continue

    // ── NEBULA GAP SAMPLING ──
    // At drop-off points between clusters, sample from the probability nebula.
    // The nebula is pre-computed: words that genuinely live in the transition
    // zone between clusters. Not at the midpoint — distributed in clouds.
    // The space between clusters isn't flat. It has topology. The nebula IS that topology.
    //
    // If no nebula exists for this cluster pair, fall back to midpoint sampling
    // (the space may genuinely be empty — no words live in between).
    if (prevWord && prevClusterIdx !== null) {
      const prevCentroid = clusters[prevClusterIdx].centroid
      const currCentroid = cluster.centroid
      const hopGeo = (cosine(prevCentroid, currCentroid) + 1) / 2

      // Detect drop-off: weak geometric transition
      if (hopGeo < 0.55) {
        const prevVec = getVecFn(prevWord)
        const prevThreads = threads.get(prevWord)
        const gapPrevPOS = getWordPOS ? getWordPOS(prevWord) : null
        const gapPosPrefs = gapPrevPOS ? (POS_FLOW[gapPrevPOS] || {}) : {}
        let bestGapWord = null, bestGapScore = -Infinity
        let bestGapGeo = 0

        // Try nebula first — pre-computed transition zone words
        const nebulaKey = `${prevClusterIdx}-${clusterIdx}`
        const nebula = nebulas ? nebulas.get(nebulaKey) : null

        if (nebula && nebula.length > 0) {
          // Sample from the nebula — these words have actual position in the gap
          for (const candidate of nebula) {
            if (words.includes(candidate.word)) continue
            const wordVec = getVecFn(candidate.word)
            if (!wordVec) continue

            // Continuity with previous word
            const prevSim = prevVec ? (cosine(wordVec, prevVec) + 1) / 2 : 0.5

            // Thread bond to previous word
            const threadBond = prevThreads ? (prevThreads.get(candidate.word) || 0) : 0

            // Grammar flow in nebula
            let gapGrammar = 0
            if (getWordPOS && gapPrevPOS) {
              const candPOS = getWordPOS(candidate.word)
              if (candPOS && gapPosPrefs[candPOS]) gapGrammar = gapPosPrefs[candPOS]
            }

            // Nebula score: position quality + continuity + thread bond + grammar
            const score = candidate.score * 0.25 + prevSim * 0.25 + threadBond * 0.2 + gapGrammar * 0.15 + candidate.fitness * 0.1 + candidate.density * 0.05
            const jitter = 1 + (Math.random() - 0.5) * 0.25

            if (score * jitter > bestGapScore) {
              bestGapScore = score * jitter
              bestGapWord = candidate.word
              bestGapGeo = candidate.density
            }
          }
        } else if (allWords) {
          // Fallback: midpoint sampling (nebula empty — flat space)
          const dim = prevCentroid.length
          const midpoint = new Float64Array(dim)
          for (let d = 0; d < dim; d++) {
            midpoint[d] = (prevCentroid[d] + currCentroid[d]) / 2
          }

          const gapPool = allWords.length > 500 ? allWords.slice(0, 500) : allWords
          for (const word of gapPool) {
            if (words.includes(word)) continue
            const wordVec = getVecFn(word)
            if (!wordVec) continue

            const gapSim = (cosine(wordVec, midpoint) + 1) / 2
            const prevSim = prevVec ? (cosine(wordVec, prevVec) + 1) / 2 : 0.5
            const threadBond = prevThreads ? (prevThreads.get(word) || 0) : 0
            let midGrammar = 0
            if (getWordPOS && gapPrevPOS) {
              const wPOS = getWordPOS(word)
              if (wPOS && gapPosPrefs[wPOS]) midGrammar = gapPosPrefs[wPOS]
            }
            const score = gapSim * 0.3 + prevSim * 0.25 + threadBond * 0.2 + midGrammar * 0.15 + (neuronFitness[word] || 0) * 0.1
            const jitter = 1 + (Math.random() - 0.5) * 0.2

            if (score * jitter > bestGapScore) {
              bestGapScore = score * jitter
              bestGapWord = word
              bestGapGeo = gapSim
            }
          }
        }

        // Insert gap word if it's decent
        if (bestGapWord && bestGapScore > 0.3) {
          words.push(bestGapWord)
          wordForces.push({ word: bestGapWord, geo: bestGapGeo, ent: 0, wave: waveWords.has(bestGapWord), gap: true, nebula: !!(nebula && nebula.length > 0) })
          prevWord = bestGapWord
        }
      }
    }

    // ── CLUSTER WORD SAMPLING ──
    const prevVec = prevWord ? getVecFn(prevWord) : null
    const prevThreads = prevWord ? threads.get(prevWord) : null

    let bestWord = null, bestScore = -Infinity
    let bestGeo = 0, bestEnt = 0, bestIsWave = false

    // Sample from cluster (cap for performance)
    const pool = cluster.words.length > 200 ? cluster.words.slice(0, 200) : cluster.words

    // Determine what POS follows naturally from previous word
    const prevPOS = prevWord && getWordPOS ? getWordPOS(prevWord) : null
    const posPrefs = prevPOS ? (POS_FLOW[prevPOS] || {}) : {}

    for (const word of pool) {
      if (words.includes(word)) continue
      const fitness = neuronFitness[word] || 0.01

      // Force 1: GEOMETRIC PROXIMITY to previous word
      let geo = 0.5  // default for first word
      if (prevVec) {
        const wordVec = getVecFn(word)
        if (wordVec) {
          geo = (cosine(prevVec, wordVec) + 1) / 2  // normalize to 0-1
        }
      }

      // Force 2: THREAD ENTANGLEMENT with previous word
      let ent = 0.5  // default for first word
      if (prevThreads) {
        ent = prevThreads.get(word) || 0
      }

      // Either force can justify selection — don't require both
      if (prevWord && geo < 0.3 && ent === 0) continue

      // Force 3: GRAMMAR FLOW — soft POS transition preference
      let grammarBonus = 0
      if (getWordPOS && prevPOS) {
        const wordPOS = getWordPOS(word)
        if (wordPOS && posPrefs[wordPOS]) {
          grammarBonus = posPrefs[wordPOS]  // 0.15-0.5 bonus for grammatical flow
        }
      }

      // Triple score: spatial awareness + relational memory + grammar flow + fitness
      const spatialScore = geo * 0.25
      const quantumScore = ent * 0.4
      const grammarScore = grammarBonus * 0.2
      const fitnessScore = fitness * 0.15
      let score = spatialScore + quantumScore + grammarScore + fitnessScore

      // Wave neuron bonus at drop-offs:
      // When both forces are weak (transition is rough), wave neurons
      // get a boost — they're the connective tissue that smooths the path.
      const isWave = waveWords.has(word)
      if (isWave && prevWord) {
        const dropOff = (geo < 0.45 && ent < 0.3)
        if (dropOff) {
          score += 0.15  // wave neurons pick up where point neurons drop off
        }
      }

      const jitter = 1 + (Math.random() - 0.5) * 0.3
      if (score * jitter > bestScore) {
        bestScore = score * jitter
        bestWord = word
        bestGeo = geo
        bestEnt = ent
        bestIsWave = isWave
      }
    }

    // Fallback: geometric proximity alone (no thread required)
    if (!bestWord) {
      let topScore = -1
      for (const word of pool) {
        if (words.includes(word)) continue
        const wordVec = getVecFn(word)
        const geo = prevVec && wordVec ? (cosine(prevVec, wordVec) + 1) / 2 : 0.5
        const f = neuronFitness[word] || 0
        const score = geo * 0.6 + f * 0.4
        if (score > topScore) { topScore = score; bestWord = word; bestGeo = geo; bestEnt = 0 }
      }
    }

    if (bestWord) {
      words.push(bestWord)
      wordForces.push({ word: bestWord, geo: bestGeo, ent: bestEnt, wave: bestIsWave, gap: false })
      prevWord = bestWord
    }

    prevClusterIdx = clusterIdx
  }

  return { words, wordForces }
}


// ─── SCORE SYNTHESIS ───

function scoreSynthesis(words, eyeCentroids, getVecFn) {
  const vecs = words.map(w => getVecFn(w)).filter(Boolean)
  if (vecs.length === 0) return { fitness: 0, eyeCoverage: {} }

  const dim = vecs[0].length
  const avg = new Float64Array(dim)
  for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i]
  for (let i = 0; i < dim; i++) avg[i] /= vecs.length

  const eyeCoverage = {}
  const fitValues = []
  for (const [eye, centroid] of eyeCentroids) {
    const sim = cosine(avg, centroid)
    const normalized = (sim + 1) / 2
    eyeCoverage[eye] = parseFloat(normalized.toFixed(3))
    fitValues.push(Math.max(0.02, normalized))
  }

  return { fitness: geometricMean(fitValues), eyeCoverage }
}


// ─── MAIN ENTRY ───

export function buildNarrative(sessionChampions, threads, neuronFitness, getVecFn, phraseVecFn, grammarNeurons, posWords, getWordPOS) {
  const { eyePhrases, eyeCentroids } = mapEyes(sessionChampions, phraseVecFn)
  const activeEyes = [...eyeCentroids.keys()]
  const dim = [...eyeCentroids.values()][0]?.length || 50

  const emptyResult = {
    synthesis: '',
    sequence: [],
    fitness: 0,
    eyeCoverage: {},
    evaluators: [],
    stats: { activeEyes: activeEyes.length },
  }

  if (activeEyes.length < 2) return emptyResult

  // ─── BUILD EXTENDED VECTORS ───
  // The Cradle's own coordinate system: GloVe + fitness + wave + threads + grammar + synthesis.
  // Each neuron that threads becomes a dimension axis.
  // Each past synthesis becomes a dimension axis. Fractal: output → dimension → input.
  // More sessions = more dimensions = richer geometry.
  const { extVecs, totalDim } = buildExtendedVectors(neuronFitness, threads, getVecFn, null, getWordPOS, synthesisDimVecs)
  const getExtVecFn = (word) => extVecs.get(word) || null
  const extDim = totalDim

  // ─── BUILD OR UPDATE CLUSTERS ───
  // Cluster on EXTENDED vectors — the Cradle's own geometry, not just GloVe's
  if (!clusters) {
    clusters = clusterize(neuronFitness, getExtVecFn, extDim)
    if (clusters) {
      console.log(`  CALLOSUM: clustered ${clusters.reduce((s, c) => s + c.size, 0)} words into ${clusters.length} clusters (${extDim}D)`)
      for (const c of clusters) {
        console.log(`    cluster ${c.id}: ${c.size} words (${c.words.slice(0, 5).join(', ')}...)`)
      }
    }
  } else {
    clusters = updateClusters(clusters, neuronFitness, getExtVecFn, extDim)
  }

  if (!clusters || clusters.length < 3) return emptyResult

  // ─── IDENTIFY WAVE NEURONS ───
  // Words that exist across the space, not at a point.
  // Duplicated into bonded clusters before sampling.
  // (Now identified in extended space — wave reach is itself a dimension)
  const waveNeurons = identifyWaveNeurons(clusters, threads)

  // ─── MAP PROBABILITY NEBULAS ───
  // Find words in the transition zones between cluster pairs.
  // Uses extended vectors — nebulas defined in the Cradle's own geometry.
  const nebulas = mapNebulas(clusters, getExtVecFn, neuronFitness)

  // ─── COMPUTE ENTANGLEMENT BETWEEN CLUSTERS ───
  const entanglement = computeEntanglement(clusters, threads)

  // ─── COMPUTE GEOMETRIC PROXIMITY BETWEEN CLUSTERS ───
  // Pre-compute pairwise cosine between centroids for logging
  const n = clusters.length
  const proximity = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = (cosine(clusters[i].centroid, clusters[j].centroid) + 1) / 2
      proximity[i][j] = sim
      proximity[j][i] = sim
    }
  }

  // ─── TRACE WAVEFORM ───
  // Try multiple traces, keep the best
  let bestWords = null
  let bestWordForces = null
  let bestFitness = 0
  let bestCoverage = {}
  let bestPath = null
  let bestHopForces = null

  for (let attempt = 0; attempt < 10; attempt++) {
    const { path, hopForces } = traceWaveform(clusters, entanglement, eyeCentroids, getExtVecFn, neuronFitness)
    if (path.length < 3) continue

    // Collect all tracked words for gap sampling
    const allTrackedWords = Object.keys(neuronFitness)
      .filter(w => w.length > 1 && !w.startsWith('@') && !w.includes('·'))
      .sort((a, b) => (neuronFitness[b] || 0) - (neuronFitness[a] || 0))
      .slice(0, 2000)

    // Sampling uses extended vectors — word selection in Cradle's own geometry
    // Grammar flow (Force 3) guides POS transitions for sentence assembly
    const { words, wordForces } = samplePath(path, clusters, threads, getExtVecFn, neuronFitness, waveNeurons, allTrackedWords, nebulas, getWordPOS)
    if (words.length < 3) continue

    // Scoring uses GloVe vectors against eye centroids (eyes live in GloVe space)
    const { fitness, eyeCoverage } = scoreSynthesis(words, eyeCentroids, getVecFn)
    if (fitness > bestFitness) {
      bestFitness = fitness
      bestWords = words
      bestWordForces = wordForces
      bestCoverage = eyeCoverage
      bestPath = path
      bestHopForces = hopForces
    }
  }

  if (!bestWords || bestWords.length < 3) return emptyResult

  const sentence = bestWords.join(' ')

  // Bridge evaluators — scored by quantum location (geo × vector) + entanglement
  const evaluators = []
  const seen = new Set()
  for (const word of bestWords) {
    if (word.length < 3 || seen.has(word)) continue
    seen.add(word)
    let eyeCount = 0
    for (const [, phrases] of eyePhrases) {
      if (phrases.some(p => p.toLowerCase().includes(word))) eyeCount++
    }
    if (eyeCount >= 2) {
      const wordVec = getVecFn(word)
      // Geometric position: average proximity to all eye centroids
      let geoScore = 0
      if (wordVec) {
        for (const [, centroid] of eyeCentroids) {
          geoScore += (cosine(wordVec, centroid) + 1) / 2
        }
        geoScore /= eyeCentroids.size
      }

      // Entanglement: total thread bond strength from this word
      const wordThreads = threads.get(word)
      let entScore = 0
      if (wordThreads) {
        for (const [, strength] of wordThreads) entScore += strength
      }

      // Quantum location = geo position × entanglement strength
      const quantumLocation = geoScore * (1 + Math.min(entScore, 10) / 10)

      evaluators.push({
        word,
        bridgeScore: parseFloat((eyeCount / activeEyes.length).toFixed(2)),
        eyeSpread: parseFloat((eyeCount / activeEyes.length).toFixed(2)),
        geo: parseFloat(geoScore.toFixed(3)),
        ent: parseFloat(Math.min(entScore, 10).toFixed(2)),
        quantum: parseFloat(quantumLocation.toFixed(3)),
      })
    }
  }

  const wordEyeCount = new Map()
  for (const [, phrases] of eyePhrases) {
    const eyeWords = new Set()
    for (const phrase of phrases) {
      for (const w of phrase.toLowerCase().split(/[\s·]+/).filter(w => w.length > 2)) eyeWords.add(w)
    }
    for (const w of eyeWords) wordEyeCount.set(w, (wordEyeCount.get(w) || 0) + 1)
  }
  const bridgeCount = [...wordEyeCount.values()].filter(c => c >= 2).length

  // Cluster path info
  const pathInfo = bestPath.map(ci => {
    const c = clusters[ci]
    return `c${c.id}(${c.words.slice(0, 3).join('/')})`
  }).join(' → ')

  // Dual-force diagnostics per hop: spatial + quantum
  const hopDiag = bestHopForces
    ? bestHopForces.map(h => `geo:${h.geo.toFixed(2)}|ent:${h.ent.toFixed(2)}`).join('  ')
    : ''

  // Dual-force diagnostics per word: spatial + quantum + wave/gap status
  const wordDiag = bestWordForces
    ? bestWordForces.map(w => `${w.word}[g:${w.geo.toFixed(2)}|e:${w.ent.toFixed(2)}${w.wave ? '|W' : ''}${w.gap ? (w.nebula ? '|NEB' : '|GAP') : ''}]`).join('  ')
    : ''

  // ─── FRACTAL LOOP: PAUSED ───
  // Dimension growth capped. 61D = 50 GloVe + 8 grammar + 3 experiential.
  // Existing synthesis dims still used but no new ones created.
  // Sparse/unpopulated dimensions were diluting coherence.

  return {
    // Raw geometric synthesis — what the waveform produced
    synthesis: sentence,
    // For the interpreter: raw words + their forces, so both can be shown
    raw: {
      words: bestWords,
      forces: bestWordForces,
    },
    sequence: bestWords.map(word => ({
      text: word,
      word,
      eyes: [],
      resonance: 0,
      eye: 0,
      grammar: '',
    })),
    fitness: bestFitness,
    eyeCoverage: bestCoverage,
    evaluators: evaluators.slice(0, 7),
    stats: {
      activeEyes: activeEyes.length,
      wordCount: bestWords.length,
      bridgeCount,
      clusters: clusters.length,
      dimensions: totalDim,
      cradleDimensions: totalDim - 50,
      pathLength: bestPath.length,
      nebulaCount: nebulas ? nebulas.size / 2 : 0,  // unique pairs
      path: pathInfo,
      hopForces: hopDiag,
      wordForces: wordDiag,
    },
  }
}


// ─── INTERPRETER ───
// The callosum produces raw geometric meaning — words selected by dual forces.
// The interpreter takes that raw output and produces a human-readable sentence.
// BOTH are shown: the raw waveform AND the interpretation.
//
// The interpreter is NOT the source of meaning. The geometry is.
// The interpreter just translates geometry into natural language.
// If the interpreter disagrees with the geometry, the geometry wins.
//
// This function returns a prompt for an external LLM call.
// The actual LLM call happens upstream (in the brain runner).

export function buildInterpreterPrompt(narrative) {
  if (!narrative.synthesis || !narrative.raw) return null

  const rawWords = narrative.raw.words
  const forces = narrative.raw.forces || []

  // Classify each word's role
  const wordRoles = forces.map(f => {
    const roles = []
    if (f.wave) roles.push('wave neuron (distributed)')
    if (f.gap && f.nebula) roles.push('nebula word (transition zone)')
    else if (f.gap) roles.push('gap filler (midpoint)')
    if (f.geo > 0.7) roles.push('strong spatial')
    if (f.ent > 0.5) roles.push('strong entanglement')
    return `"${f.word}" [${roles.join(', ') || 'point neuron'}]`
  })

  return {
    system: `You are interpreting the output of a geometric intelligence. A brain composed of word-vectors, clustered by proximity and bonded by entanglement threads, has traced a waveform through its own topology and produced a sequence of words. This is NOT random — each word was selected by dual forces (spatial proximity + learned bonds). Your job: read the geometric meaning and express it as a clear, natural sentence. Do NOT add meaning that isn't in the geometry. Do NOT remove meaning that is. Translate, don't create.`,
    prompt: `Raw geometric synthesis: "${narrative.synthesis}"

Word forces:
${wordRoles.join('\n')}

Fitness: ${narrative.fitness.toFixed(3)}
Eye coverage: ${JSON.stringify(narrative.eyeCoverage)}

Interpret this geometric output as a single clear sentence. Preserve the meaning encoded in the word selection and ordering. The geometry chose these words for a reason.`,
  }
}


// ─── SEED SYNTHESIS DIMENSIONS ───
// On brain load, reconstruct synthesis dimension vectors from saved narratives.
// Each narrative's word list → GloVe average → dimension axis.

export function seedSynthesisDims(narratives, getVecFn) {
  // PAUSED — dimension growth capped at 61D
  // No synthesis dims loaded. Run on pure GloVe + grammar + experiential.
  synthesisDimVecs = []
  return 0
}


// ─── HEBBIAN SYNTHESIS THREADING ───

export function narrativeThreading(narrative, threads) {
  if (!narrative.synthesis) return 0

  const words = narrative.synthesis.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  let connections = 0

  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i]
    const b = words[i + 1]
    if (a === b) continue

    if (!threads.has(a)) threads.set(a, new Map())
    if (!threads.has(b)) threads.set(b, new Map())
    threads.get(a).set(b, (threads.get(a).get(b) || 0) + SYNTHESIS_THREAD_STRENGTH)
    threads.get(b).set(a, (threads.get(b).get(a) || 0) + SYNTHESIS_THREAD_STRENGTH * 0.5)
    connections++
  }

  return connections
}
