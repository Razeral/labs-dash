import { useState } from 'react'
import { Card } from './Card'
import { TIER_META } from '../types'
import type { Project, Tier, TierOverrides } from '../types'

type Props = {
  tier: Tier
  projects: Project[]
  hostBySlug: Record<string, string>
  editing: boolean
  overrides: TierOverrides
  onDragStart: (slug: string) => void
  onDrop: (tier: Tier) => void
}

export const TierSection = ({ tier, projects, hostBySlug, editing, overrides, onDragStart, onDrop }: Props) => {
  const meta = TIER_META[tier]
  const count = projects.length
  const [dropTarget, setDropTarget] = useState(false)

  // Only an editing session can receive a drop, so only an editing session
  // advertises where the card would land.
  const className = ['tier', `tier--${tier}`, editing && dropTarget ? 'tier--drop-target' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={className}
      onDragOver={(e) => {
        if (!editing) return
        e.preventDefault()
        setDropTarget(true)
      }}
      onDragLeave={(e) => {
        // dragleave also fires when crossing into a child; ignore those.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropTarget(false)
      }}
      onDrop={(e) => { e.preventDefault(); setDropTarget(false); onDrop(tier) }}
    >
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
              draggable={editing}
              overridden={Boolean(overrides[p.slug])}
              onDragStart={onDragStart}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
