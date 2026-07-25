export type Tier = 'living' | 'ascended' | 'dormant' | 'risen' | 'fallen'

export type Successor = {
  name: string
  slug?: string
}

export type Project = {
  slug: string
  name: string
  blurb: string
  tier: Tier
  host?: string
  absorbedInto?: Successor
  note?: string
}

export type TierOverrides = Record<string, Tier>

export const TIERS: Tier[] = ['living', 'ascended', 'dormant', 'risen', 'fallen']

// The Ascended is the one rank a drag cannot produce. Ascending means being absorbed into a
// NAMED successor, and a dragged card carries no successor to name — the drop would write a
// tier with no `absorbedInto`, which renders as "⟶ ascended into undefined" and exports a
// roster that fails the ascended-iff-absorbedInto invariant in src/data/projects.test.ts.
// Ascended cards still render normally and are still draggable OUT of the rank.
export const acceptsDrop = (tier: Tier): boolean => tier !== 'ascended'

export const TIER_META: Record<Tier, { glyph: string; name: string; lore: string }> = {
  living: { glyph: '◆', name: 'THE LIVING', lore: 'Maintained. Someone answers for them.' },
  ascended: { glyph: '✦', name: 'THE ASCENDED', lore: 'Absorbed into greater works. The repos remain as reference.' },
  dormant: { glyph: '◇', name: 'THE DORMANT', lore: 'Still standing. Nobody is building.' },
  risen: { glyph: '◈', name: 'THE RISEN', lore: 'Still running. Still billing. Unclaimed.' },
  fallen: { glyph: '†', name: 'THE FALLEN', lore: 'Cold since spring. Here for the record.' }
}
