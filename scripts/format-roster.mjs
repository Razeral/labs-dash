// format-roster.mjs — serialise the roster so each project folds to a useful one-liner.
//
// Editors show the FIRST line of a folded block, so `{` on its own tells you nothing. Putting
// `name` and `tier` on the opening line means a fully-collapsed file reads as the tier list
// itself:
//
//     { "name": "GovBrain", "tier": "living", …
//     { "name": "Offside", "tier": "ascended", …
//
// Key order is irrelevant to the app (plain property access), so this is purely an editing
// affordance. Mirrored in src/rosterFormat.ts for the in-app export — keep the two in step.

const HEAD = ['name', 'tier']
const TAIL = ['slug', 'blurb', 'host', 'absorbedInto', 'note']

const j = (v) => JSON.stringify(v)

const formatProject = (p, indent) => {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const head = HEAD.filter((k) => p[k] !== undefined).map((k) => `${j(k)}: ${j(p[k])}`).join(', ')
  const tail = TAIL.filter((k) => p[k] !== undefined).map((k) => {
    // absorbedInto is a small object; keep it on one line so it never adds a fold of its own.
    const value = k === 'absorbedInto' ? j(p[k]) : j(p[k])
    return `${inner}${j(k)}: ${value}`
  })
  // Any key we don't know about is preserved rather than silently dropped.
  const known = new Set([...HEAD, ...TAIL])
  for (const k of Object.keys(p)) {
    if (!known.has(k)) tail.push(`${inner}${j(k)}: ${j(p[k])}`)
  }
  if (tail.length === 0) return `${pad}{ ${head} }`
  return `${pad}{ ${head},\n${tail.join(',\n')}\n${pad}}`
}

export const formatRoster = ({ omit = [], projects = [] }) => {
  const omitBlock = omit.length === 0
    ? '[]'
    : `[\n${omit.map((s) => `    ${j(s)}`).join(',\n')}\n  ]`
  const body = projects.map((p) => formatProject(p, 4)).join(',\n')
  return `{\n  "omit": ${omitBlock},\n  "projects": [\n${body}\n  ]\n}\n`
}
