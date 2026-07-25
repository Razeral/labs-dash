import { describe, it, expect } from 'vitest'
import { TIERS, TIER_META } from './types'

describe('tier constants', () => {
  it('orders ranks by descending vitality with ascended second', () => {
    expect(TIERS).toEqual(['living', 'ascended', 'dormant', 'risen', 'fallen'])
  })

  it('gives every tier a glyph and a display name', () => {
    for (const tier of TIERS) {
      expect(TIER_META[tier].glyph).toBeTruthy()
      expect(TIER_META[tier].name).toMatch(/^THE /)
    }
  })
})
