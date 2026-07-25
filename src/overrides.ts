import { TIERS, acceptsDrop } from './types'
import type { Project, Tier, TierOverrides } from './types'

export const STORAGE_KEY = 'labs-dash:overrides'

const isTier = (value: unknown): value is Tier =>
  typeof value === 'string' && (TIERS as string[]).includes(value)

// An override only ever originates from a drop, so a stored tier that cannot receive a drop
// is either hand-edited or left over from a build that allowed it. Drop it on read rather
// than let it re-tier a card into a state the UI can no longer produce.
const isStorableTier = (value: unknown): value is Tier => isTier(value) && acceptsDrop(value)

// Every localStorage call is wrapped. Access itself throws — not just the parse — when site
// data is blocked, a managed-browser policy forbids it, or the page runs in an embedded
// webview. readOverrides is called from a useState initialiser with no error boundary above
// it, so a throw here escapes render and leaves #root empty with no message at all.
export const readOverrides = (): TierOverrides => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(([, tier]) => isStorableTier(tier))
    ) as TierOverrides
  } catch {
    return {}
  }
}

export const writeOverride = (slug: string, tier: Tier): TierOverrides => {
  const next = { ...readOverrides(), [slug]: tier }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota exceeded, or a private/managed context that refuses writes. The override still
    // applies to this session — it just will not survive a reload. Losing persistence beats
    // throwing out of the drag handler.
  }
  return next
}

export const clearOverrides = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // The caller resets its own React state regardless, so the board still clears on screen.
  }
}

// `absorbedInto` is meaningful only for the ascended, and projects.test.ts requires the two to
// agree exactly. Re-tiering a card out of ascended must therefore strip it, or `copy
// projects.json` emits a roster that fails its own tests when pasted back.
//
// Both halves of that invariant are enforced here rather than left to the caller, so
// exportRoster's output is valid for ANY override map: an override to ascended is discarded
// (nothing can supply the successor it would need), and any other override strips absorbedInto.
export const applyOverrides = (projects: Project[], overrides: TierOverrides): Project[] =>
  projects.map((p) => {
    const tier = overrides[p.slug]
    if (!tier || !acceptsDrop(tier)) return p
    const { absorbedInto: _absorbedInto, ...rest } = p
    return { ...rest, tier }
  })

// Emits the FULL file shape, not a bare array, so pasting the output back into
// src/data/projects.json preserves the omit list instead of silently discarding it.
export const exportRoster = (
  projects: Project[],
  overrides: TierOverrides,
  omit: readonly string[] = []
): string =>
  JSON.stringify({ omit: [...omit], projects: applyOverrides(projects, overrides) }, null, 2) + '\n'
