import { TIERS } from './types'
import type { Project, Tier, TierOverrides } from './types'

export const STORAGE_KEY = 'labs-dash:overrides'

const isTier = (value: unknown): value is Tier =>
  typeof value === 'string' && (TIERS as string[]).includes(value)

export const readOverrides = (): TierOverrides => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(([, tier]) => isTier(tier))
    ) as TierOverrides
  } catch {
    return {}
  }
}

export const writeOverride = (slug: string, tier: Tier): TierOverrides => {
  const next = { ...readOverrides(), [slug]: tier }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const clearOverrides = (): void => localStorage.removeItem(STORAGE_KEY)

export const applyOverrides = (projects: Project[], overrides: TierOverrides): Project[] =>
  projects.map((p) => (overrides[p.slug] ? { ...p, tier: overrides[p.slug] } : p))

export const exportRoster = (projects: Project[], overrides: TierOverrides): string =>
  JSON.stringify(applyOverrides(projects, overrides), null, 2) + '\n'
