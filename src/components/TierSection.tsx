import { useState } from 'react'
import { Card } from './Card'
import { TIER_META, acceptsDrop } from '../types'
import type { Project, Tier, TierOverrides } from '../types'

type Props = {
  tier: Tier
  projects: Project[]
  hostBySlug: Record<string, string>
  artBySlug?: Record<string, string>
  editing: boolean
  overrides: TierOverrides
  onDragStart: (slug: string) => void
  onOpen: (slug: string) => void
  onDrop: (tier: Tier) => void
}

export const TierSection = ({ tier, projects, hostBySlug, artBySlug = {}, editing, overrides, onDragStart, onOpen, onDrop }: Props) => {
  const meta = TIER_META[tier]
  const count = projects.length
  const [dropTarget, setDropTarget] = useState(false)

  // Only an editing session can receive a drop, and The Ascended can never receive one at
  // all — see acceptsDrop in types.ts. A rank that cannot take the card must not advertise
  // that it can, so the same flag gates the drop-target styling.
  const droppable = editing && acceptsDrop(tier)

  const className = ['tier', `tier--${tier}`, droppable && dropTarget ? 'tier--drop-target' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <section
      id={`rank-${tier}`}
      className={className}
      onDragOver={(e) => {
        if (!droppable) return
        e.preventDefault()
        setDropTarget(true)
      }}
      onDragLeave={(e) => {
        // dragleave also fires when crossing into a child; ignore those.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropTarget(false)
      }}
      onDrop={(e) => {
        // Not reachable in a real browser without a preventDefault'd dragover, but a
        // synthesised drop must not re-tier either.
        if (!droppable) return
        e.preventDefault()
        setDropTarget(false)
        onDrop(tier)
      }}
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
              art={artBySlug[p.slug]}
              onDragStart={onDragStart}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
