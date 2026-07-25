import type { Project } from './types'

// Mirror of scripts/format-roster.mjs — keep the two in step. Editors show the FIRST line of a
// folded block, so putting `name` and `tier` on the opening line makes a fully-collapsed file
// read as the tier list itself:
//
//     { "name": "GovBrain", "tier": "living", "slug": "govbrain", …
//     { "name": "Offside", "tier": "ascended", "slug": "offside", …
//
// `slug` is on that line deliberately: the `omit` list matches on slug, not name, so the
// value you need to copy is visible without expanding the entry.
//
// Key order is irrelevant to the app (plain property access); this is purely an editing
// affordance, so the export writes the same shape the file already uses.

const HEAD: (keyof Project)[] = ['name', 'tier', 'slug']
const TAIL: (keyof Project)[] = ['blurb', 'host', 'absorbedInto', 'note']

const j = (v: unknown): string => JSON.stringify(v)

const formatProject = (p: Project, indent: number): string => {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 2)
  const head = HEAD.filter((k) => p[k] !== undefined)
    .map((k) => `${j(k)}: ${j(p[k])}`)
    .join(', ')
  const tail = TAIL.filter((k) => p[k] !== undefined).map((k) => `${inner}${j(k)}: ${j(p[k])}`)
  if (tail.length === 0) return `${pad}{ ${head} }`
  return `${pad}{ ${head},\n${tail.join(',\n')}\n${pad}}`
}

export const formatRoster = (omit: readonly string[], projects: Project[]): string => {
  const omitBlock =
    omit.length === 0 ? '[]' : `[\n${omit.map((s) => `    ${j(s)}`).join(',\n')}\n  ]`
  const body = projects.map((p) => formatProject(p, 4)).join(',\n')
  return `{\n  "omit": ${omitBlock},\n  "projects": [\n${body}\n  ]\n}\n`
}
