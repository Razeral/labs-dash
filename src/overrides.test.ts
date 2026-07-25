import { describe, it, expect, beforeEach } from 'vitest'
import {
  STORAGE_KEY, readOverrides, writeOverride, clearOverrides, applyOverrides, exportRoster
} from './overrides'
import type { Project } from './types'

const seed: Project[] = [
  { slug: 'a', name: 'A', blurb: 'first', tier: 'living', host: 'https://a.example' },
  { slug: 'b', name: 'B', blurb: 'second', tier: 'fallen' }
]

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
    expect(out).toHaveLength(2)
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
    const parsed = JSON.parse(json) as Project[]
    expect(parsed.find((p) => p.slug === 'a')?.tier).toBe('risen')
    expect(json.endsWith('\n')).toBe(true)
  })
})
