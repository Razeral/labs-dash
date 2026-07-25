import { describe, it, expect } from 'vitest'
import raw from './projects.json'
import { roster as rendered, omit } from './roster'
import { TIERS } from '../types'
import type { Roster } from '../types'

const file = raw as Roster
const roster = file.projects

describe('projects.json', () => {
  it('has a plausible number of entries', () => {
    // Deliberately not a fixed count: the roster is hand-edited, projects come and go, and a
    // frozen number fails for the wrong reason every time someone curates the list.
    expect(roster.length).toBeGreaterThan(20)
  })

  it('has unique non-empty slugs', () => {
    const slugs = roster.map((p) => p.slug)
    expect(slugs.every((s) => s.length > 0)).toBe(true)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('uses only valid tiers', () => {
    for (const p of roster) expect(TIERS).toContain(p.tier)
  })

  it('keeps blurbs to one readable line', () => {
    for (const p of roster) {
      expect(p.blurb.length).toBeGreaterThan(0)
      expect(p.blurb.length).toBeLessThanOrEqual(100)
    }
  })

  it('has a parseable absolute URL for every host', () => {
    for (const p of roster.filter((x) => x.host)) {
      expect(() => new URL(p.host as string)).not.toThrow()
      expect(p.host).toMatch(/^https:\/\//)
    }
  })

  it('never gives a fallen entry a live link', () => {
    for (const p of roster.filter((x) => x.tier === 'fallen')) {
      expect(p.host).toBeUndefined()
      expect(p.absorbedInto).toBeUndefined()
    }
  })

  it('carries absorbedInto exactly when ascended', () => {
    for (const p of roster) {
      if (p.tier === 'ascended') expect(p.absorbedInto?.name).toBeTruthy()
      else expect(p.absorbedInto).toBeUndefined()
    }
  })

  it('resolves every absorbedInto.slug to a real roster entry', () => {
    const slugs = new Set(roster.map((p) => p.slug))
    for (const p of roster) {
      const target = p.absorbedInto?.slug
      if (target) expect(slugs.has(target)).toBe(true)
    }
  })

  it('only omits slugs that actually exist (typo guard)', () => {
    const slugs = new Set(roster.map((p) => p.slug))
    for (const slug of omit) expect(slugs.has(slug)).toBe(true)
  })

  it('keeps omitted projects in the file but off the rendered roster', () => {
    for (const slug of omit) {
      expect(roster.find((p) => p.slug === slug)).toBeDefined()
      expect(rendered.find((p) => p.slug === slug)).toBeUndefined()
    }
    expect(rendered).toHaveLength(roster.length - omit.length)
  })

  it('does not list labs-dash itself', () => {
    expect(roster.find((p) => p.slug === 'labs-dash')).toBeUndefined()
  })
})
