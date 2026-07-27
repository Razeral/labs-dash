import { Card } from './Card'
import { TIER_META } from '../types'
import type { Project, Tier } from '../types'

type Props = {
  tier: Tier
  projects: Project[]
  hostBySlug: Record<string, string>
  artBySlug?: Record<string, string>
  onOpen: (slug: string) => void
}

export const TierSection = ({ tier, projects, hostBySlug, artBySlug = {}, onOpen }: Props) => {
  const meta = TIER_META[tier]
  const count = projects.length

  return (
    <section id={`rank-${tier}`} className={`tier tier--${tier}`}>
      <header className="tier__header">
        <span className="tier__glyph" aria-hidden="true">{meta.glyph}</span>
        <h2 className="tier__name">{meta.name}</h2>
        <span className="tier__count">{count === 0 ? 'none' : `${count} realm${count === 1 ? '' : 's'}`}</span>
        <p className="tier__lore">{meta.lore}</p>
      </header>
      <div className="tier__grid">
        {projects.map((p, i) => (
          <div key={p.slug} className="tier__cell" style={{ ['--i' as string]: i }}>
            <Card
              project={p}
              successorHost={p.absorbedInto?.slug ? hostBySlug[p.absorbedInto.slug] : undefined}
              art={artBySlug[p.slug]}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
