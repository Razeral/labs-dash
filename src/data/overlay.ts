// Runtime config overlay fetched from S3 at page load.
// Lets you omit projects, override tiers/names/blurbs without redeploying.
//
// Edit live: aws s3 cp config.json s3://labs-dash-site/config.json --cache-control 'public,max-age=60'
// Or use the in-page editor (flip cards to hide, drag to re-tier).

export interface OverlayEntry {
  omit?: boolean
  tier?: string
  name?: string
  blurb?: string
}

export type Overlay = Record<string, OverlayEntry>

const OVERLAY_URL = '/config.json'
const CACHE_KEY = 'labs-dash-overlay'
const CACHE_TTL_MS = 60_000 // 1 minute

let cached: { data: Overlay; ts: number } | null = null

export async function fetchOverlay(): Promise<Overlay> {
  // Return cache if fresh
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

  try {
    const resp = await fetch(OVERLAY_URL, { cache: 'no-cache' })
    if (!resp.ok) return cached?.data ?? {}
    const data = await resp.json() as Overlay
    cached = { data, ts: Date.now() }
    // Also persist to localStorage for offline resilience
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* quota */ }
    return data
  } catch {
    // Network error — fall back to localStorage or empty
    try {
      const stored = localStorage.getItem(CACHE_KEY)
      if (stored) {
        const data = JSON.parse(stored) as Overlay
        cached = { data, ts: Date.now() }
        return data
      }
    } catch { /* corrupt */ }
    return cached?.data ?? {}
  }
}

export function applyOverlay<T extends { slug: string; tier: string; name: string; blurb: string }>(
  projects: T[],
  omit: string[],
  overlay: Overlay
): T[] {
  const mergedOmit = new Set(omit)

  return projects
    .filter(p => {
      const ov = overlay[p.slug]
      if (ov?.omit === true) return false
      if (ov?.omit === false) mergedOmit.delete(p.slug) // un-omit
      return !mergedOmit.has(p.slug)
    })
    .map(p => {
      const ov = overlay[p.slug]
      if (!ov) return p
      return {
        ...p,
        ...(ov.tier ? { tier: ov.tier as T['tier'] } : {}),
        ...(ov.name ? { name: ov.name } : {}),
        ...(ov.blurb ? { blurb: ov.blurb } : {}),
      }
    })
}

// Save overlay back to S3 — requires the page to have upload capability.
// For now, this generates the JSON for manual upload or CLI use.
export function serializeOverlay(overlay: Overlay): string {
  return JSON.stringify(overlay, null, 2) + '\n'
}
