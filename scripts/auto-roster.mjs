// auto-roster.mjs — auto-update the roster from disk + CloudFront + OG tags
//
//   npm run auto-roster              update projects.json + card art from live state
//   npm run auto-roster -- --deploy  ...then test + typecheck + deploy
//
// Data sources (in priority order for each field):
//   blurb:  hand-curated > OG og:description > ABOUT.md/README.md > placeholder
//   name:   hand-curated > OG og:title > slug
//   host:   hand-curated > CloudFront alias discovery
//   art:    hand-placed > downloaded from OG og:image (resized to 720px JPEG)
//
// Preserves ALL hand-curated fields. Only fills gaps. Never overwrites curated data.
import { execSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatRoster } from './format-roster.mjs'

const ROOT = process.env.TERRA_ROOT || ''
const FILE = 'src/data/projects.json'
const CARDS_DIR = 'src/assets/cards'
const NOW = new Date()
const DEPLOY = process.argv.includes('--deploy')
const HAS_DISK = ROOT && (() => { try { readdirSync(ROOT); return true } catch { return false } })()
// Projects that must NEVER reach the roster, not even as an omitted entry (an omitted
// entry is one edit away from being shown). The disk scan admits any projects/<slug>/ that
// is a git repo, so a project becomes eligible the moment it gains its own .git — this list
// is the only thing that keeps one out. 'labs-dash' is this repo itself; the others are
// private by request.
const NEVER_LIST = new Set(['labs-dash', 'team-tracker'])
const CARD_WIDTH = 720
const CARD_QUALITY = 60

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
const cfHosts = new Map()
try {
  const raw = execSync(
    'aws cloudfront list-distributions --query \'DistributionList.Items[].[Aliases.Items,DomainName]\' --output json',
    { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] }
  )
  const dists = JSON.parse(raw)
  for (const [aliases] of dists) {
    if (!aliases) continue
    for (const alias of aliases) {
      const match = alias.match(/^([^.]+)\.(labs\.ai\.tech\.gov\.sg|ai\.tech\.gov\.sg|agents\.ai\.tech\.gov\.sg)$/)
      if (match && !['stg', 'labs', 'langfuse', 'pocgw', 'nprd'].includes(match[1]) && !match[1].startsWith('gw')) {
        cfHosts.set(match[1], `https://${alias}`)
      }
    }
  }
  console.log(c.dim(`  Found ${cfHosts.size} hosted aliases`))
} catch {
  console.log(c.amber('  Could not query CloudFront — using existing host data only'))
}

// ---- Scrape OG tags from hosted projects ----
console.log(c.bold('  Scraping OG tags from hosted projects...'))
const ogData = new Map() // slug → { title, description, image }

for (const [slug, host] of cfHosts) {
  try {
    const html = execSync(
      `curl -s --max-time 8 -A 'Slackbot-LinkExpanding' '${host}/'`,
      { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'ignore'] }
    )
    const extract = (prop) => {
      // Use [^"']* for double-quoted content, [^'"]*  for single-quoted — but HTML often
      // uses double quotes around content that contains apostrophes. Match the outer quote
      // type and allow the other inside.
      const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content="([^"]*)"`, 'i'))
        || html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content='([^']*)'`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property=["']og:${prop}["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content='([^']*)'[^>]*property=["']og:${prop}["']`, 'i'))
      return m ? m[1] : null
    }
    const title = extract('title')
    const description = extract('description')
    const image = extract('image')
    if (title || description || image) {
      ogData.set(slug, { title, description, image })
    }
  } catch { /* skip unreachable hosts */ }
}
console.log(c.dim(`  Got OG data for ${ogData.size}/${cfHosts.size} hosted projects`))

// ---- Download and resize OG images as card art ----
console.log(c.bold('  Updating card art from OG images...'))
mkdirSync(CARDS_DIR, { recursive: true })

const hasSips = (() => { try { execSync('which sips', { stdio: 'ignore' }); return true } catch { return false } })()
const hasConvert = (() => { try { execSync('which convert', { stdio: 'ignore' }); return true } catch { return false } })()

for (const [slug, og] of ogData) {
  if (!og.image) continue
  const cardPath = join(CARDS_DIR, `${slug}.jpg`)

  // Skip if we already have hand-placed art (heuristic: file exists and wasn't just created)
  if (existsSync(cardPath)) {
    // Check if it's a recent download (< 1 hour old) or hand-placed
    // For simplicity: always re-download if OG image URL changed or file is missing
    // But don't overwrite hand-curated art — skip if file exists
    continue
  }

  try {
    const tmpPng = `/tmp/og-${slug}.png`
    const tmpJpg = `/tmp/og-${slug}.jpg`

    // Download
    execSync(`curl -s --max-time 15 -o '${tmpPng}' '${og.image}'`, {
      timeout: 20000, stdio: ['pipe', 'pipe', 'ignore']
    })

    // Check file size — skip tiny or huge images
    const stat = statSync(tmpPng)
    if (stat.size < 5000 || stat.size > 5_000_000) {
      execSync(`rm -f '${tmpPng}'`, { stdio: 'ignore' })
      continue
    }

    // Resize to 720px wide JPEG
    if (hasSips) {
      // macOS sips
      execSync(`sips -Z ${CARD_WIDTH} -s format jpeg -s formatOptions ${CARD_QUALITY} '${tmpPng}' --out '${cardPath}' 2>/dev/null`, {
        timeout: 15000, stdio: ['pipe', 'pipe', 'ignore']
      })
    } else if (hasConvert) {
      // ImageMagick
      execSync(`convert '${tmpPng}' -resize ${CARD_WIDTH}x -quality ${CARD_QUALITY} '${cardPath}'`, {
        timeout: 15000, stdio: ['pipe', 'pipe', 'ignore']
      })
    } else {
      // No image tools — just copy as-is (will be larger but functional)
      execSync(`cp '${tmpPng}' '${cardPath}'`, { stdio: 'ignore' })
    }

    execSync(`rm -f '${tmpPng}' '${tmpJpg}'`, { stdio: 'ignore' })

    if (existsSync(cardPath)) {
      const newSize = statSync(cardPath).size
      log(`${c.green('+')} ${slug}: downloaded card art from OG image (${Math.round(newSize / 1024)}KB)`)
    }
  } catch {
    // Silent fail — art download is best-effort
  }
}

// ---- Scan disk repos (skip if not available, e.g. in CI) ----
const diskRepos = new Set()
if (HAS_DISK) {
  for (const slug of readdirSync(ROOT).sort()) {
    if (NEVER_LIST.has(slug)) continue
    try {
      if (!statSync(join(ROOT, slug, '.git')).isDirectory()) continue
    } catch { continue }
    diskRepos.add(slug)
  }
  console.log(c.dim(`  Found ${diskRepos.size} repos on disk`))
} else {
  console.log(c.dim('  No TERRA_ROOT set or not accessible — skipping disk scan (CI mode)'))
}

// ---- Compute age for tier seeding ----
const ageDays = (repoPath) => {
  if (!HAS_DISK) return 0
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
  if (!HAS_DISK) return ''
  for (const fname of ['ABOUT.md', 'README.md']) {
    try {
      const content = readFileSync(join(ROOT, slug, fname), 'utf8')
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

for (const [slug, prev] of prevBySlug) {
  const onDisk = diskRepos.has(slug)
  const cfHost = cfHosts.get(slug)
  const og = ogData.get(slug)
  const age = onDisk ? ageDays(join(ROOT, slug)) : 999

  const entry = { ...prev }

  // Update host from CloudFront
  if (cfHost && !prev.host) {
    entry.host = cfHost
    log(`${c.green('+')} ${slug}: discovered host ${cfHost}`)
  }

  // Fill name from OG title if still slug-default
  if (entry.name === slug && og?.title) {
    entry.name = og.title
    log(`${c.green('~')} ${slug}: name from OG title "${og.title}"`)
  }

  // Fill blurb: OG description > disk README > placeholder (only if empty/placeholder)
  if (!entry.blurb || entry.blurb === 'No description recorded.') {
    const newBlurb = og?.description || (onDisk ? readBlurb(slug) : '')
    if (newBlurb && newBlurb !== entry.blurb) {
      // Truncate to 100 chars (test enforces this)
      entry.blurb = newBlurb.length > 100 ? newBlurb.slice(0, 97) + '...' : newBlurb
      const source = og?.description ? 'OG tags' : 'disk'
      log(`${c.green('~')} ${slug}: blurb from ${source}`)
    }
  }

  // Mark deleted repos as fallen (only with disk access, and not if still hosted)
  if (HAS_DISK && !onDisk && !cfHost && slug !== 'analytics' && prev.tier !== 'fallen' && prev.tier !== 'ascended') {
    entry.tier = 'fallen'
    delete entry.host
    log(`${c.amber('↓')} ${slug}: repo gone, ${prev.tier} → fallen`)
  }

  // Tier freshness for uncurated entries
  if (prev.name === prev.slug && prev.tier === 'living' && age > 60 && !cfHost) {
    entry.tier = 'dormant'
    log(`${c.amber('↓')} ${slug}: uncurated living → dormant (${age} days since commit)`)
  }

  updated.set(slug, entry)
}

// Add new entries from CloudFront (CI) or disk (local)
// Union of disk repos and CloudFront hosts — a project might be hosted but live in a monorepo
// (no standalone .git), or exist on disk but not yet deployed.
const newSlugs = new Set([...diskRepos, ...cfHosts.keys()])
for (const slug of newSlugs) {
  if (updated.has(slug)) continue
  if (slug === 'analytics') continue
  const age = HAS_DISK ? ageDays(join(ROOT, slug)) : 0
  const cfHost = cfHosts.get(slug)
  const og = ogData.get(slug)
  const blurb = og?.description || readBlurb(slug) || 'No description recorded.'

  const entry = {
    slug,
    name: og?.title || slug,
    blurb: blurb.length > 100 ? blurb.slice(0, 97) + '...' : blurb,
    tier: seedTier(slug, age, Boolean(cfHost)),
  }
  if (cfHost) entry.host = cfHost

  updated.set(slug, entry)
  const src = og ? 'OG tags' : (HAS_DISK ? 'disk' : 'CloudFront')
  log(`${c.green('+')} ${slug}: new entry (${entry.tier}${cfHost ? ', hosted' : ''}) from ${src}`)
}

// Clean up orphan omit entries
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
