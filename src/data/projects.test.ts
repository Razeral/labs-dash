import { describe, it, expect } from 'vitest'
import projects from './projects.json'
import { TIERS } from '../types'
import type { Project } from '../types'

const roster = projects as Project[]

describe('projects.json', () => {
  it('has 49 entries', () => {
    expect(roster).toHaveLength(49)
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

  it('does not list labs-dash itself', () => {
    expect(roster.find((p) => p.slug === 'labs-dash')).toBeUndefined()
  })
})
