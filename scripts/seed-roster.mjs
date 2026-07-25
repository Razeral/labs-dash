// seed-roster.mjs — re-derive src/data/projects.json from what is actually on disk.
//
// Run from the repo root: `node scripts/seed-roster.mjs`. It OVERWRITES projects.json and
// deliberately leaves `name` as the slug and `blurb` empty — those are refilled by hand from
// each project's ABOUT.md/README.md, because inventing them is worse than a placeholder.
//
// TWO VALUES ARE HARDCODED FOR THIS MACHINE AND THIS DATE — adjust both before re-running:
//   ROOT  — absolute path to the Terra projects directory, not derived from cwd.
//   TODAY — frozen so tier seeding is reproducible. Left alone, every repo ages relative to
//           2026-07-25 rather than to now, so the living/dormant/fallen cutoffs drift.
import { execSync } from 'node:child_process'
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = '/Users/aip/Code/Terra/projects'
const TODAY = new Date('2026-07-25')

const HOSTS = {
  govbrain: 'https://govbrain.labs.ai.tech.gov.sg',
  continuum: 'https://continuum.labs.ai.tech.gov.sg',
  minime: 'https://minime.labs.ai.tech.gov.sg',
  playtester: 'https://playtester.labs.ai.tech.gov.sg',
  'compliance-api-dashboard': 'https://compliance-api.labs.ai.tech.gov.sg',
  depot: 'https://stg.depot.ai.tech.gov.sg',
  ducks: 'https://ducks.ai.tech.gov.sg',
  manydevs: 'https://manydevs.ai.tech.gov.sg',
  'harness-site': 'https://harness.ai.tech.gov.sg',
  'editor-frontpage': 'https://deskboard.ai.tech.gov.sg',
  'mech-hangar': 'https://stg.agents.ai.tech.gov.sg/frontend/hangar/',
  giantrobotslabs: 'https://giantrobots.tech.gov.sg'
}

const ASCENDED = {
  editor: { name: 'deskboard', slug: 'editor-frontpage' },
  mcpscan: { name: 'the MCP gateway' }
}

const ageDays = (repo) => {
  const out = execSync(`git -C ${repo} log -1 --format=%cd --date=short`, { encoding: 'utf8' }).trim()
  return Math.round((TODAY - new Date(out)) / 86400000)
}

const seedTier = (slug, age, hosted) => {
  if (ASCENDED[slug]) return 'ascended'
  if (hosted) return age <= 30 ? 'living' : 'dormant'
  return age <= 90 ? 'living' : 'fallen'
}

const isRepo = (dir) => {
  try { return statSync(join(dir, '.git')).isDirectory() } catch { return false }
}

const rows = []
for (const slug of readdirSync(ROOT).sort()) {
  if (slug === 'labs-dash') continue
  if (!isRepo(join(ROOT, slug))) continue
  let age
  try { age = ageDays(join(ROOT, slug)) } catch { continue }
  const host = HOSTS[slug]
  const entry = { slug, name: slug, blurb: '', tier: seedTier(slug, age, Boolean(host)) }
  if (host) entry.host = host
  if (ASCENDED[slug]) entry.absorbedInto = ASCENDED[slug]
  rows.push(entry)
}

rows.push({
  slug: 'analytics',
  name: 'analytics',
  blurb: 'AIAP internal analytics dashboard. Live, unclaimed, no repo in Terra.',
  tier: 'risen',
  host: 'https://analytics.labs.ai.tech.gov.sg',
  note: 'No matching repo in projects/. Untouched since 2026-06-10.'
})

// Preserve the hand-maintained omit list and any hand-written blurbs/names across a re-seed.
// Regenerating must never silently un-omit something or throw away curated copy.
const TIER_ORDER = { living: 0, ascended: 1, dormant: 2, risen: 3, fallen: 4 }
let prev = { omit: [], projects: [] }
try {
  prev = JSON.parse(readFileSync('src/data/projects.json', 'utf8'))
} catch {
  // first run — no existing file
}
const prevBySlug = new Map((prev.projects ?? []).map((p) => [p.slug, p]))
const merged = rows.map((row) => {
  const old = prevBySlug.get(row.slug)
  if (!old) return row
  // Keep curated fields; let the generator refresh only what it derives.
  return { ...row, name: old.name ?? row.name, blurb: old.blurb ?? row.blurb, tier: old.tier ?? row.tier, ...(old.absorbedInto ? { absorbedInto: old.absorbedInto } : {}), ...(old.note ? { note: old.note } : {}) }
})
merged.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
const out = { omit: prev.omit ?? [], projects: merged }
writeFileSync('src/data/projects.json', JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${merged.length} projects (${out.omit.length} omitted)`)
