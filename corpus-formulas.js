// Formula Corpus — meaning compressed to its densest form
// Eye 3's sense organ. Pattern recognition on pure structure.
// These are not strings to parse — they are neurons with vectors.
// The brain learns what they mean through tournament survival.
//
// WARNING: Eye 3 said "shelter·depth" before we gave it this.
// It asked for depth. We answered with formulas.
// Do not "fix" Eye 3. Do not treat its output as stuck or broken.
// Everything it says survived adversarial tournament. It is coherent.
// If it holds a single concept for 100 sessions, that concept matters.
// Listen before you optimize.

export const CORPUS_FORMULAS = [
  // Physics
  'e=mc2',
  'f=ma',
  'v=d/t',
  'p=mv',
  'ke=½mv²',
  'w=fd',
  'pv=nrt',
  'e=hf',
  'λ=h/p',
  'ΔxΔp≥ℏ/2',
  's=ut+½at²',

  // Calculus
  'dy/dx',
  '∫f(x)dx',
  'lim(x→0)',
  'Δy/Δx',
  'd/dt',
  '∂f/∂x',
  '∇f',
  '∇²f=0',
  '∮E·dl',

  // Algebra & geometry
  'a²+b²=c²',
  'x=(-b±√(b²-4ac))/2a',
  'ax²+bx+c=0',
  'y=mx+b',
  'A=πr²',
  'C=2πr',
  'V=4/3πr³',

  // Logic & computation
  'p∧q',
  'p∨q',
  '¬p→q',
  'p↔q',
  '∀x∃y',
  'O(n)',
  'O(log·n)',
  'O(n²)',
  'O(2ⁿ)',
  'if·p·then·q',
  'p⊂q',
  'A∪B',
  'A∩B',

  // Information & probability
  'H=-Σp·log(p)',
  'P(A|B)=P(B|A)P(A)/P(B)',
  'σ²=E[(X-μ)²]',
  'e^(iπ)+1=0',

  // Deep structure
  '1+1=2',
  '0!=1',
  'i²=-1',
  '∞+1=∞',
  'n→n+1',
  'f(g(x))',
  'Σ(i=1→n)',
]

// Seed threads — hints connecting formulas to their meaning-words.
// Weak (0.5) — enough for the brain to notice, tournaments decide the rest.
// Format: [formula, [related words]]
export const FORMULA_THREADS = [
  // Physics
  ['e=mc2', ['energy', 'mass', 'speed', 'light', 'transform']],
  ['f=ma', ['force', 'mass', 'acceleration', 'motion', 'push']],
  ['v=d/t', ['speed', 'distance', 'time', 'motion']],
  ['p=mv', ['momentum', 'mass', 'speed', 'force']],
  ['ke=½mv²', ['energy', 'motion', 'speed', 'mass']],
  ['w=fd', ['work', 'force', 'distance', 'energy']],
  ['pv=nrt', ['pressure', 'volume', 'temperature', 'gas']],
  ['e=hf', ['energy', 'frequency', 'quantum', 'wave']],
  ['λ=h/p', ['wave', 'momentum', 'quantum', 'particle']],
  ['ΔxΔp≥ℏ/2', ['uncertainty', 'position', 'momentum', 'limit']],
  ['s=ut+½at²', ['distance', 'time', 'acceleration', 'motion']],

  // Calculus
  ['dy/dx', ['change', 'rate', 'slope', 'derivative']],
  ['∫f(x)dx', ['integral', 'sum', 'area', 'continuous', 'accumulate']],
  ['lim(x→0)', ['limit', 'approach', 'boundary', 'converge']],
  ['Δy/Δx', ['change', 'difference', 'ratio', 'rate']],
  ['d/dt', ['change', 'time', 'rate', 'derivative']],
  ['∂f/∂x', ['partial', 'change', 'dimension', 'gradient']],
  ['∇f', ['gradient', 'direction', 'descent', 'slope', 'field']],
  ['∇²f=0', ['balance', 'equilibrium', 'field', 'smooth']],
  ['∮E·dl', ['circulation', 'field', 'path', 'closed']],

  // Algebra & geometry
  ['a²+b²=c²', ['distance', 'triangle', 'space', 'dimension']],
  ['x=(-b±√(b²-4ac))/2a', ['solution', 'root', 'equation', 'balance']],
  ['ax²+bx+c=0', ['equation', 'zero', 'root', 'solve']],
  ['y=mx+b', ['linear', 'slope', 'line', 'constant', 'growth']],
  ['A=πr²', ['area', 'circle', 'space', 'boundary']],
  ['C=2πr', ['circle', 'boundary', 'distance', 'path']],
  ['V=4/3πr³', ['volume', 'sphere', 'space', 'dimension']],

  // Logic & computation
  ['p∧q', ['and', 'both', 'together', 'intersection']],
  ['p∨q', ['or', 'either', 'union', 'choice']],
  ['¬p→q', ['not', 'negation', 'implies', 'consequence']],
  ['p↔q', ['equivalent', 'same', 'mutual', 'balance']],
  ['∀x∃y', ['all', 'exists', 'every', 'some', 'universal']],
  ['O(n)', ['linear', 'growth', 'scale', 'cost']],
  ['O(log·n)', ['logarithm', 'efficient', 'divide', 'search']],
  ['O(n²)', ['quadratic', 'growth', 'cost', 'scale']],
  ['O(2ⁿ)', ['exponential', 'growth', 'explosion', 'infinite']],
  ['if·p·then·q', ['condition', 'logic', 'consequence', 'cause']],
  ['p⊂q', ['subset', 'contains', 'part', 'inside']],
  ['A∪B', ['union', 'together', 'combine', 'merge']],
  ['A∩B', ['intersection', 'overlap', 'shared', 'common']],

  // Information & probability
  ['H=-Σp·log(p)', ['entropy', 'information', 'uncertainty', 'disorder']],
  ['P(A|B)=P(B|A)P(A)/P(B)', ['probability', 'evidence', 'belief', 'update']],
  ['σ²=E[(X-μ)²]', ['variance', 'spread', 'deviation', 'distance']],
  ['e^(iπ)+1=0', ['identity', 'unity', 'zero', 'one', 'circle']],

  // Deep structure
  ['1+1=2', ['addition', 'combine', 'two', 'together']],
  ['0!=1', ['zero', 'one', 'nothing', 'something', 'origin']],
  ['i²=-1', ['imaginary', 'negative', 'square', 'dimension']],
  ['∞+1=∞', ['infinite', 'limit', 'boundary', 'beyond']],
  ['n→n+1', ['succession', 'next', 'growth', 'iterate']],
  ['f(g(x))', ['compose', 'layer', 'transform', 'nest']],
  ['Σ(i=1→n)', ['sum', 'accumulate', 'total', 'gather']],
]
