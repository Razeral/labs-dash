import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  STORAGE_KEY, readOverrides, writeOverride, clearOverrides, applyOverrides, exportRoster
} from './overrides'
import { TIERS } from './types'
import type { Project } from './types'

const seed: Project[] = [
  { slug: 'a', name: 'A', blurb: 'first', tier: 'living', host: 'https://a.example' },
  { slug: 'b', name: 'B', blurb: 'second', tier: 'fallen' },
  { slug: 'c', name: 'C', blurb: 'third', tier: 'ascended', absorbedInto: { name: 'A', slug: 'a' } }
]

// The invariant src/data/projects.test.ts enforces on the committed roster. exportRoster
// output is pasted straight back into projects.json, so it has to satisfy the same rule.
const expectAscendedIffAbsorbedInto = (roster: Project[]) => {
  for (const p of roster) {
    if (p.tier === 'ascended') expect(p.absorbedInto?.name).toBeTruthy()
    else expect(p.absorbedInto).toBeUndefined()
  }
}

beforeEach(() => localStorage.clear())

describe('overrides', () => {
  it('returns an empty map when nothing is stored', () => {
    expect(readOverrides()).toEqual({})
  })

  it('persists a written override', () => {
    writeOverride('a', 'dormant')
    expect(readOverrides()).toEqual({ a: 'dormant' })
  })

  it('falls back to empty on corrupt stored JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(readOverrides()).toEqual({})
  })

  it('ignores a stored tier that is not a real tier', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 'banished' }))
    expect(readOverrides()).toEqual({})
  })

  it('re-tiers a project when applied', () => {
    const out = applyOverrides(seed, { a: 'risen' })
    expect(out.find((p) => p.slug === 'a')?.tier).toBe('risen')
    expect(out.find((p) => p.slug === 'b')?.tier).toBe('fallen')
  })

  it('ignores an override for an unknown slug', () => {
    const out = applyOverrides(seed, { ghost: 'living' })
    expect(out).toHaveLength(3)
  })

  it('drops a stored ascended override, which no drop can legitimately produce', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 'ascended', b: 'risen' }))
    expect(readOverrides()).toEqual({ b: 'risen' })
  })

  it('strips absorbedInto when re-tiering a project out of ascended', () => {
    const out = applyOverrides(seed, { c: 'dormant' })
    const moved = out.find((p) => p.slug === 'c')
    expect(moved?.tier).toBe('dormant')
    expect(moved?.absorbedInto).toBeUndefined()
    expect('absorbedInto' in (moved as object)).toBe(false)
  })

  it('keeps absorbedInto on a project left in ascended', () => {
    const out = applyOverrides(seed, { a: 'risen' })
    expect(out.find((p) => p.slug === 'c')?.absorbedInto?.name).toBe('A')
  })

  it('does not strip absorbedInto from the input roster', () => {
    applyOverrides(seed, { c: 'fallen' })
    expect(seed[2].absorbedInto?.name).toBe('A')
  })

  it('does not mutate the input roster', () => {
    applyOverrides(seed, { a: 'risen' })
    expect(seed[0].tier).toBe('living')
  })

  it('clears every override', () => {
    writeOverride('a', 'dormant')
    clearOverrides()
    expect(readOverrides()).toEqual({})
  })

  it('exports valid JSON with overrides applied', () => {
    const json = exportRoster(seed, { a: 'risen' })
    const parsed = (JSON.parse(json) as { omit: string[]; projects: Project[] }).projects
    expect(parsed.find((p) => p.slug === 'a')?.tier).toBe('risen')
    expect(json.endsWith('\n')).toBe(true)
  })

  it('exports a roster that still satisfies ascended-iff-absorbedInto', () => {
    // The exported JSON is pasted back into src/data/projects.json, so any override
    // combination has to leave the file passing its own data tests.
    expectAscendedIffAbsorbedInto((JSON.parse(exportRoster(seed, {})) as { omit: string[]; projects: Project[] }).projects)
    expectAscendedIffAbsorbedInto((JSON.parse(exportRoster(seed, { c: 'living' })) as { omit: string[]; projects: Project[] }).projects)
    expectAscendedIffAbsorbedInto((JSON.parse(exportRoster(seed, { c: 'fallen', a: 'risen' })) as { omit: string[]; projects: Project[] }).projects)
    for (const tier of TIERS) {
      expectAscendedIffAbsorbedInto((JSON.parse(exportRoster(seed, { c: tier, a: tier, b: tier })) as { omit: string[]; projects: Project[] }).projects)
    }
  })
})

// localStorage access itself throws — not just JSON.parse — when site data is blocked by
// policy or the page is in an embedded webview. readOverrides runs in a useState initialiser
// with no error boundary above it, so a throw that escapes leaves #root empty.
describe('overrides under a hostile localStorage', () => {
  const breakStorage = (method: 'getItem' | 'setItem' | 'removeItem') =>
    vi.spyOn(window.localStorage, method).mockImplementation(() => {
      throw new Error('The operation is insecure.')
    })

  afterEach(() => vi.restoreAllMocks())

  it('degrades to no overrides when getItem throws', () => {
    breakStorage('getItem')
    expect(() => readOverrides()).not.toThrow()
    expect(readOverrides()).toEqual({})
  })

  it('leaves every project on its seed tier when getItem throws', () => {
    breakStorage('getItem')
    const out = applyOverrides(seed, readOverrides())
    expect(out.map((p) => p.tier)).toEqual(seed.map((p) => p.tier))
  })

  it('still returns the new override when setItem throws', () => {
    breakStorage('setItem')
    expect(writeOverride('a', 'dormant')).toEqual({ a: 'dormant' })
  })

  it('does not throw out of clearOverrides when removeItem throws', () => {
    breakStorage('removeItem')
    expect(() => clearOverrides()).not.toThrow()
  })
})

describe('exportRoster formatting', () => {
  it('puts name and tier on each project opening line so a folded file reads as the tier list', () => {
    const json = exportRoster(seed, {}, ['b'])
    const lines = json.split('\n')
    const opens = lines.filter((l) => l.trimStart().startsWith('{ "name":'))
    expect(opens).toHaveLength(seed.length)
    for (const line of opens) expect(line).toMatch(/^\s*\{ "name": ".+", "tier": "\w+", "slug": ".+",?/)
  })

  it('round-trips: the formatted output parses back to the same data', () => {
    const json = exportRoster(seed, { a: 'fallen' }, ['b'])
    const parsed = JSON.parse(json) as { omit: string[]; projects: Project[] }
    expect(parsed.omit).toEqual(['b'])
    expect(parsed.projects.map((p) => p.slug)).toEqual(seed.map((p) => p.slug))
    expect(parsed.projects.find((p) => p.slug === 'a')?.tier).toBe('fallen')
  })
})
