// drift-check.mjs — detect what's stale between the roster, disk, and live infra
//
//   npm run drift          report only (exit 0 = clean, exit 1 = drift found)
//
// Compares three sources of truth:
//   1. src/data/projects.json  — what the board shows
//   2. Terra/projects/ on disk — what repos actually exist
//   3. CloudFront aliases      — what's actually hosted at *.labs.ai.tech.gov.sg
//
// Reports: missing from board, phantom entries, tier staleness, host mismatches.
import { execSync } from 'node:child_process'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.env.TERRA_ROOT || '/Users/aip/Code/Terra/projects'
const FILE = 'src/data/projects.json'
const NOW = new Date()

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
}

let issues = 0
const flag = (msg) => { console.log(`  ${c.red('✗')} ${msg}`); issues++ }
const warn = (msg) => { console.log(`  ${c.amber('!')} ${msg}`) }
const ok = (msg) => { console.log(`  ${c.green('✓')} ${msg}`) }

// ---- 1. Load roster ----
let roster
try {
  roster = JSON.parse(readFileSync(FILE, 'utf8'))
} catch (e) {
  console.error(c.red(`Cannot parse ${FILE}: ${e.message}`))
  process.exit(1)
}

const rosterBySlug = new Map(roster.projects.map(p => [p.slug, p]))
const omitSet = new Set(roster.omit)
const renderedSlugs = new Set(roster.projects.filter(p => !omitSet.has(p.slug)).map(p => p.slug))

// ---- 2. Scan disk ----
console.log(c.bold('\n  Disk vs Roster'))
const diskRepos = new Set()
for (const slug of readdirSync(ROOT).sort()) {
  if (slug === 'labs-dash') continue
  try {
    if (!statSync(join(ROOT, slug, '.git')).isDirectory()) continue
  } catch { continue }
  diskRepos.add(slug)
}

// Repos on disk but not in roster at all (not even omitted)
const missingFromRoster = [...diskRepos].filter(s => !rosterBySlug.has(s))
if (missingFromRoster.length > 0) {
  for (const s of missingFromRoster) {
    const lastCommit = getLastCommit(join(ROOT, s))
    flag(`${s} exists on disk but is not in projects.json (last commit: ${lastCommit})`)
  }
} else {
  ok('All disk repos are in the roster')
}

// Roster entries with no matching repo on disk (phantom entries)
const phantoms = [...rosterBySlug.keys()].filter(s => !diskRepos.has(s) && s !== 'analytics')
if (phantoms.length > 0) {
  for (const s of phantoms) {
    const entry = rosterBySlug.get(s)
    if (entry.tier !== 'fallen') {
      flag(`${s} is in roster as "${entry.tier}" but has no repo on disk — should be omitted or fallen`)
    } else {
      warn(`${s} is fallen with no repo (tombstone — acceptable)`)
    }
  }
} else {
  ok('No phantom roster entries')
}

// Omit entries matching no project
const orphanOmits = [...omitSet].filter(s => !rosterBySlug.has(s))
if (orphanOmits.length > 0) {
  for (const s of orphanOmits) flag(`"${s}" is in omit but matches no project entry`)
}

// ---- 3. Check CloudFront for hosted projects ----
console.log(c.bold('\n  Live Hosting vs Roster'))
let cfAliases = new Map() // slug → domain
try {
  const raw = execSync(
    'aws cloudfront list-distributions --query \'DistributionList.Items[].[Aliases.Items,Comment]\' --output json',
    { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] }
  )
  const dists = JSON.parse(raw)
  for (const [aliases] of dists) {
    if (!aliases) continue
    for (const alias of aliases) {
      // Match *.labs.ai.tech.gov.sg patterns
      const match = alias.match(/^([^.]+)\.(labs\.ai\.tech\.gov\.sg|ai\.tech\.gov\.sg|agents\.ai\.tech\.gov\.sg)$/)
      if (match) {
        const slug = match[1]
        cfAliases.set(slug, alias)
      }
    }
  }
} catch {
  warn('Could not query CloudFront (AWS creds expired?). Skipping hosting check.')
}

if (cfAliases.size > 0) {
  // Hosted but not in roster
  for (const [slug, domain] of cfAliases) {
    if (slug === 'labs') continue // the index itself
    if (slug === 'langfuse') continue // separate tool
    if (slug === 'stg' || slug === 'gw-nprd' || slug === 'gw2-nprd' || slug === 'pocgw' || slug === 'nprd') continue // infra
    if (!rosterBySlug.has(slug)) {
      flag(`${slug} is live at ${domain} but not in the roster`)
    }
  }

  // In roster with a host that doesn't match CloudFront
  for (const [slug, entry] of rosterBySlug) {
    if (!entry.host) continue
    if (omitSet.has(slug)) continue
    try {
      const hostname = new URL(entry.host).hostname
      const cfDomain = cfAliases.get(slug)
      if (cfDomain && cfDomain !== hostname) {
        warn(`${slug}: roster host is ${hostname} but CloudFront alias is ${cfDomain}`)
      }
    } catch { /* unparseable host */ }
  }

  // Roster says "living" with a host but no CloudFront alias found
  for (const [slug, entry] of rosterBySlug) {
    if (entry.tier === 'living' && entry.host && !omitSet.has(slug)) {
      if (!cfAliases.has(slug)) {
        warn(`${slug}: marked living with host ${entry.host} but no matching CloudFront alias found`)
      }
    }
  }

  ok(`Checked ${cfAliases.size} CloudFront aliases`)
}

// ---- 4. Tier freshness ----
console.log(c.bold('\n  Tier Freshness'))
const STALE_DAYS = 60
let staleCount = 0
for (const [slug, entry] of rosterBySlug) {
  if (omitSet.has(slug)) continue
  if (!diskRepos.has(slug)) continue
  const lastCommit = getLastCommitDate(join(ROOT, slug))
  if (!lastCommit) continue
  const daysSince = Math.round((NOW - lastCommit) / 86400000)

  if (entry.tier === 'living' && daysSince > STALE_DAYS) {
    warn(`${slug}: marked living but last commit was ${daysSince} days ago (${lastCommit.toISOString().slice(0, 10)})`)
    staleCount++
  }
  if ((entry.tier === 'dormant' || entry.tier === 'fallen') && daysSince < 14) {
    warn(`${slug}: marked ${entry.tier} but had a commit ${daysSince} days ago — might be living again`)
    staleCount++
  }
}
if (staleCount === 0) ok('All tiers look current')

// ---- Summary ----
console.log('')
if (issues === 0) {
  console.log(c.green('  ✓ No drift detected'))
} else {
  console.log(c.red(`  ✗ ${issues} issue(s) found`))
}
console.log(c.dim(`\n  Fix: edit ${FILE}, then npm run roster to verify, npm run roster:deploy to ship\n`))

process.exit(issues > 0 ? 1 : 0)

// ---- Helpers ----
function getLastCommit(repoPath) {
  try {
    return execSync(`git -C ${repoPath} log -1 --format=%cd --date=short`, {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore']
    }).trim()
  } catch { return 'unknown' }
}

function getLastCommitDate(repoPath) {
  try {
    const d = execSync(`git -C ${repoPath} log -1 --format=%cI`, {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore']
    }).trim()
    return new Date(d)
  } catch { return null }
}
