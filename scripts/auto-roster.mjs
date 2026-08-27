// auto-roster.mjs — auto-update the roster from disk + CloudFront, preserving curated fields
//
//   npm run auto-roster          update projects.json from live state
//   npm run auto-roster -- --deploy   ...then test + typecheck + deploy
//
// Unlike seed-roster.mjs (which is a blunt re-derive), this script:
//   - Discovers hosts from CloudFront aliases instead of a hardcoded map
//   - Uses real dates for tier seeding (not a frozen TODAY)
//   - Preserves ALL hand-curated fields (name, blurb, note, absorbedInto, tier overrides)
//   - Adds new repos with sensible defaults
//   - Marks deleted repos as fallen (never silently removes them)
//   - Reports every change it makes
import { execSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatRoster } from './format-roster.mjs'

const ROOT = process.env.TERRA_ROOT || '/Users/aip/Code/Terra/projects'
const FILE = 'src/data/projects.json'
const NOW = new Date()
const DEPLOY = process.argv.includes('--deploy')

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
}

const changes = []
const log = (msg) => changes.push(msg)

// ---- Load current roster ----
let roster
try {
  roster = JSON.parse(readFileSync(FILE, 'utf8'))
} catch (e) {
  console.error(c.red(`Cannot parse ${FILE}: ${e.message}`))
  process.exit(1)
}

const prevBySlug = new Map(roster.projects.map(p => [p.slug, p]))
const omitSet = new Set(roster.omit)

// ---- Discover CloudFront hosts ----
console.log(c.bold('  Discovering hosts from CloudFront...'))
const cfHosts = new Map() // slug → full origin URL
try {
  const raw = execSync(
    'aws cloudfront list-distributions --query \'DistributionList.Items[].[Aliases.Items,DomainName]\' --output json',
    { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] }
  )
  const dists = JSON.parse(raw)
  for (const [aliases, domainName] of dists) {
    if (!aliases) continue
    for (const alias of aliases) {
      const match = alias.match(/^([^.]+)\.(labs\.ai\.tech\.gov\.sg|ai\.tech\.gov\.sg|agents\.ai\.tech\.gov\.sg)$/)
      if (match && match[1] !== 'stg' && match[1] !== 'labs' && match[1] !== 'langfuse'
          && !match[1].startsWith('gw') && match[1] !== 'pocgw' && match[1] !== 'nprd') {
        cfHosts.set(match[1], `https://${alias}`)
      }
    }
  }
  console.log(c.dim(`  Found ${cfHosts.size} hosted aliases`))
} catch {
  console.log(c.amber('  Could not query CloudFront — using existing host data only'))
}

// ---- Scan disk repos ----
const diskRepos = new Set()
for (const slug of readdirSync(ROOT).sort()) {
  if (slug === 'labs-dash') continue
  try {
    if (!statSync(join(ROOT, slug, '.git')).isDirectory()) continue
  } catch { continue }
  diskRepos.add(slug)
}

// ---- Compute age for tier seeding ----
const ageDays = (repoPath) => {
  try {
    const d = execSync(`git -C ${repoPath} log -1 --format=%cI`, {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore']
    }).trim()
    return Math.round((NOW - new Date(d)) / 86400000)
  } catch { return 999 }
}

const seedTier = (slug, age, hosted) => {
  if (hosted) return age <= 30 ? 'living' : 'dormant'
  return age <= 90 ? 'living' : 'fallen'
}

// ---- Read blurb from ABOUT.md or README.md ----
const readBlurb = (slug) => {
  for (const fname of ['ABOUT.md', 'README.md']) {
    try {
      const content = readFileSync(join(ROOT, slug, fname), 'utf8')
      // Extract first meaningful line after the title
      const lines = content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('|')) continue
        if (trimmed.length > 10 && trimmed.length <= 100) return trimmed
        if (trimmed.length > 100) return trimmed.slice(0, 97) + '...'
      }
    } catch { continue }
  }
  return ''
}

// ---- Build updated roster ----
const TIER_ORDER = { living: 0, ascended: 1, dormant: 2, risen: 3, fallen: 4 }
const updated = new Map()

// Process existing entries first (preserve order and curated data)
for (const [slug, prev] of prevBySlug) {
  const onDisk = diskRepos.has(slug)
  const cfHost = cfHosts.get(slug)
  const age = onDisk ? ageDays(join(ROOT, slug)) : 999

  const entry = { ...prev }

  // Update host from CloudFront if we have a better source
  if (cfHost && (!prev.host || prev.host !== cfHost)) {
    if (!prev.host) {
      entry.host = cfHost
      log(`${c.green('+')} ${slug}: discovered host ${cfHost}`)
    }
  }

  // If repo is gone and not already fallen, mark as fallen
  if (!onDisk && slug !== 'analytics' && prev.tier !== 'fallen' && prev.tier !== 'ascended') {
    entry.tier = 'fallen'
    delete entry.host
    log(`${c.amber('↓')} ${slug}: repo gone, ${prev.tier} → fallen`)
  }

  // Auto-fill empty blurbs from disk
  if ((!entry.blurb || entry.blurb === 'No description recorded.') && onDisk) {
    const blurb = readBlurb(slug)
    if (blurb && blurb !== entry.blurb) {
      entry.blurb = blurb
      log(`${c.green('~')} ${slug}: filled blurb from ${onDisk ? 'disk' : 'CloudFront'}`)
    }
  }

  // Tier freshness: if living but stale, suggest dormant (don't auto-change curated tiers)
  // Only auto-adjust if the tier was never manually set (heuristic: name === slug means uncurated)
  if (prev.name === prev.slug && prev.tier === 'living' && age > 60 && !cfHost) {
    entry.tier = 'dormant'
    log(`${c.amber('↓')} ${slug}: uncurated living → dormant (${age} days since commit)`)
  }

  updated.set(slug, entry)
}

// Add new repos not yet in roster
for (const slug of diskRepos) {
  if (updated.has(slug)) continue
  const age = ageDays(join(ROOT, slug))
  const cfHost = cfHosts.get(slug)
  const blurb = readBlurb(slug)

  const entry = {
    slug,
    name: slug,
    blurb: blurb || 'No description recorded.',
    tier: seedTier(slug, age, Boolean(cfHost)),
  }
  if (cfHost) entry.host = cfHost

  updated.set(slug, entry)
  log(`${c.green('+')} ${slug}: new entry (${entry.tier}${cfHost ? ', hosted' : ''})`)
}

// Clean up omit list — remove entries that no longer exist in projects
const validSlugs = new Set(updated.keys())
const cleanedOmit = roster.omit.filter(s => validSlugs.has(s))
if (cleanedOmit.length < roster.omit.length) {
  const removed = roster.omit.filter(s => !validSlugs.has(s))
  for (const s of removed) log(`${c.dim('-')} omit: removed orphan "${s}"`)
}

// Sort by tier then name
const sorted = [...updated.values()].sort((a, b) =>
  TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.toLowerCase().localeCompare(b.name.toLowerCase())
)

const out = { omit: cleanedOmit, projects: sorted }

// ---- Report ----
console.log(c.bold('\n  Changes'))
if (changes.length === 0) {
  console.log(c.dim('  No changes needed — roster is up to date'))
} else {
  for (const msg of changes) console.log(`  ${msg}`)
}

// ---- Write ----
if (changes.length > 0) {
  writeFileSync(FILE, formatRoster(out))
  console.log(c.green(`\n  Wrote ${sorted.length} projects (${cleanedOmit.length} omitted)`))
}

// ---- Deploy ----
if (DEPLOY && changes.length > 0) {
  console.log(c.bold('\n  Deploying...'))
  try {
    execSync('npx vitest run', { stdio: 'inherit', timeout: 60000 })
    execSync('npx tsc --noEmit', { stdio: 'inherit', timeout: 30000 })
    execSync('bash scripts/deploy.sh', { stdio: 'inherit', timeout: 120000 })
    console.log(c.green('\n  ✓ Deployed'))
  } catch (e) {
    console.error(c.red(`\n  ✗ Deploy failed: ${e.message}`))
    process.exit(1)
  }
} else if (DEPLOY) {
  console.log(c.dim('\n  No changes — skipping deploy'))
}
