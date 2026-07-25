import type { Tier } from '../types'

// One atmospheric backdrop per rank, discovered at build time like the card art. A rank with
// no image simply contributes no layer, so the feature degrades to the plain ground.
const files = import.meta.glob('../assets/tiers/*.jpg', { eager: true, query: '?url', import: 'default' })

export const tierArt: Partial<Record<Tier, string>> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [
    path.replace(/^.*\/([^/]+)\.jpg$/, '$1'),
    url as string
  ])
) as Partial<Record<Tier, string>>
