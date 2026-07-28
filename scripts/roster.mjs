// roster.mjs — show what your edit to src/data/projects.json actually did.
//
//   npm run roster          report + validate
//   npm run roster -- --deploy   ...then build and ship it
//
// A git diff of a 46-entry JSON tells you which lines moved, not what changed about the
// board. This reports the board: which projects changed rank, what went on or off, which
// art is now unused, and what the ranks add up to afterwards.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const FILE = 'src/data/projects.json'
const TIERS = ['living', 'ascended', 'dormant', 'risen', 'fallen']
const GLYPH = { living: '◆', ascended: '✦', dormant: '◇', risen: '◈', fallen: '†' }

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`
}

const die = (msg) => { console.error(`\n${c.red('✗ ' + msg)}\n`); process.exit(1) }

// ---- 1. parse, with a useful message on failure --------------------------------------
let now
try {
  now = JSON.parse(readFileSync(FILE, 'utf8'))
} catch (e) {
  die(`${FILE} is not valid JSON.\n  ${e.message}\n\n  Nothing else can run until this parses.`)
}
if (!Array.isArray(now.projects)) die(`${FILE} has no "projects" array.`)
if (!Array.isArray(now.omit)) die(`${FILE} has no "omit" array.`)

// ---- 2. the committed version, to diff against ----------------------------------------
let before = null
try {
  before = JSON.parse(execSync(`git show HEAD:${FILE}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }))
} catch {
  // first commit, or file not in HEAD — report absolute state only
}

const bySlug = (r) => new Map(r.projects.map((p) => [p.slug, p]))
const rendered = (r) => r.projects.filter((p) => !r.omit.includes(p.slug))
// Must match the rule in App.tsx: art for every rank except fallen; living needs a host.
const artEligible = (p) => p.tier !== 'fallen' && (p.tier !== 'living' || p.host)

const nowMap = bySlug(now)

// ---- 3. what changed ------------------------------------------------------------------
const changes = []
if (before) {
  const oldMap = bySlug(before)
  const oldOmit = new Set(before.omit)
  const newOmit = new Set(now.omit)

  for (const [slug, p] of nowMap) {
    const o = oldMap.get(slug)
    if (!o) { changes.push(`${c.green('+ added')}    ${slug} ${c.dim('→ ' + GLYPH[p.tier] + ' ' + p.tier)}`); continue }
    if (o.tier !== p.tier) {
      changes.push(`${c.cyan('~ re-tier')}  ${slug} ${c.dim(GLYPH[o.tier] + ' ' + o.tier + '  →  ')}${GLYPH[p.tier]} ${c.bold(p.tier)}`)
    }
    if ((o.host ?? '') !== (p.host ?? '')) {
      changes.push(`${c.cyan('~ host')}     ${slug} ${c.dim((o.host || '(none)') + '  →  ')}${p.host || '(none)'}`)
    }
    if (o.name !== p.name) changes.push(`${c.cyan('~ name')}     ${slug} ${c.dim(o.name + '  →  ')}${p.name}`)
    if (o.blurb !== p.blurb) changes.push(`${c.cyan('~ blurb')}    ${slug}`)
    if (JSON.stringify(o.absorbedInto) !== JSON.stringify(p.absorbedInto)) {
      changes.push(`${c.cyan('~ into')}     ${slug} ${c.dim((o.absorbedInto?.name || '(none)') + '  →  ')}${p.absorbedInto?.name || '(none)'}`)
    }
  }
  for (const slug of oldMap.keys()) {
    if (!nowMap.has(slug)) changes.push(`${c.red('- removed')}  ${slug}`)
  }
  for (const slug of newOmit) if (!oldOmit.has(slug)) changes.push(`${c.amber('· hidden')}   ${slug} ${c.dim('added to omit')}`)
  for (const slug of oldOmit) if (!newOmit.has(slug)) changes.push(`${c.green('· shown')}    ${slug} ${c.dim('removed from omit')}`)
}

// ---- 4. problems that would otherwise surface late ------------------------------------
const problems = []
const warnings = []

for (const slug of now.omit) {
  if (!nowMap.has(slug)) problems.push(`omit lists "${slug}", which matches no project — a typo here silently does nothing`)
}
const seen = new Set()
for (const p of now.projects) {
  if (seen.has(p.slug)) problems.push(`duplicate slug "${p.slug}"`)
  seen.add(p.slug)
  if (!TIERS.includes(p.tier)) problems.push(`"${p.slug}" has tier "${p.tier}" — must be one of ${TIERS.join(', ')}`)
  if ((p.blurb ?? '').length > 100) problems.push(`"${p.slug}" blurb is ${p.blurb.length} chars (max 100)`)
  if (p.tier === 'ascended' && !p.absorbedInto?.name) problems.push(`"${p.slug}" is ascended but has no absorbedInto.name`)
  if (p.tier !== 'ascended' && p.absorbedInto) problems.push(`"${p.slug}" is ${p.tier} but carries absorbedInto`)
  if (p.absorbedInto?.slug && !nowMap.has(p.absorbedInto.slug)) problems.push(`"${p.slug}" ascends into unknown slug "${p.absorbedInto.slug}"`)
  if (p.tier === 'fallen' && p.host) problems.push(`"${p.slug}" is fallen but records a host — a tombstone must not advertise a domain`)
  if (p.host && !/^https:\/\//.test(p.host)) problems.push(`"${p.slug}" host is not an https URL: ${p.host}`)
}

// art coverage — the thing no other check surfaces
const artDir = 'src/assets/cards'
const artFiles = existsSync(artDir) ? new Set(readdirSync(artDir).filter((f) => f.endsWith('.jpg')).map((f) => f.replace('.jpg', ''))) : new Set()
const shown = rendered(now)
const shownSlugs = new Set(shown.map((p) => p.slug))
for (const p of shown) {
  if (artEligible(p) && !artFiles.has(p.slug)) warnings.push(`"${p.slug}" (${p.tier}) is eligible for art but has no src/assets/cards/${p.slug}.jpg`)
}
for (const slug of artFiles) {
  if (!shownSlugs.has(slug)) warnings.push(`src/assets/cards/${slug}.jpg is bundled but unused — "${slug}" is omitted or gone`)
  else if (!artEligible(nowMap.get(slug))) warnings.push(`src/assets/cards/${slug}.jpg is bundled but unused — "${slug}" is ${nowMap.get(slug).tier}, which shows no art`)
}

// ---- 5. report ------------------------------------------------------------------------
const counts = TIERS.map((t) => [t, shown.filter((p) => p.tier === t).length])
const beforeShown = before ? rendered(before).length : null

console.log('')
console.log(c.bold('  roster'))
console.log(`  ${FILE}`)
console.log('')

if (!before) console.log(c.dim('  (no committed version to compare against)\n'))
else if (changes.length === 0) console.log(c.dim('  no changes vs the last commit\n'))
else {
  console.log(c.bold('  changes'))
  for (const l of changes) console.log(`    ${l}`)
  console.log('')
}

console.log(c.bold('  board'))
for (const [t, n] of counts) {
  const bar = '█'.repeat(Math.min(n, 30))
  console.log(`    ${GLYPH[t]} ${t.padEnd(9)} ${String(n).padStart(2)}  ${c.dim(bar)}`)
}
const delta = beforeShown === null ? '' : beforeShown === shown.length ? '' : c.dim(`  (was ${beforeShown})`)
console.log(`    ${' '.repeat(2)}${'rendered'.padEnd(9)} ${String(shown.length).padStart(2)}${delta}   ${c.dim(`${now.projects.length} in file, ${now.omit.length} omitted`)}`)
console.log('')

if (warnings.length) {
  console.log(c.amber('  worth knowing'))
  for (const w of warnings) console.log(`    ${c.amber('!')} ${w}`)
  console.log('')
}

if (problems.length) {
  console.log(c.red('  problems — these will fail the test suite'))
  for (const p of problems) console.log(`    ${c.red('✗')} ${p}`)
  console.log('')
  process.exit(1)
}

console.log(c.green('  ✓ roster is valid'))
console.log('')

// ---- 6. optionally ship it ------------------------------------------------------------
if (process.argv.includes('--deploy')) {
  console.log(c.dim('  running tests…'))
  execSync('npx vitest run', { stdio: 'inherit' })
  execSync('npx tsc --noEmit', { stdio: 'inherit' })
  console.log(c.dim('  deploying…'))
  execSync('bash scripts/deploy.sh', { stdio: 'inherit' })
} else {
  console.log(c.dim('  next:  npm run roster:deploy      ship it'))
  console.log(c.dim('         npm run dev                live preview, hot-reloads on save'))
  console.log('')
}
