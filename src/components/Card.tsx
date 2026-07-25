import type { Project } from '../types'

type Props = {
  project: Project
  successorHost?: string
  draggable: boolean
  overridden: boolean
  onDragStart: (slug: string) => void
}

const hostLabel = (host: string) => new URL(host).hostname

export const Card = ({ project, successorHost, draggable, overridden, onDragStart }: Props) => {
  const { slug, name, blurb, tier, host, absorbedInto, note } = project

  const href =
    tier === 'fallen' ? undefined
    : tier === 'ascended' ? successorHost
    : host

  const meta =
    tier === 'ascended' ? `⟶ ascended into ${absorbedInto?.name}`
    : tier === 'fallen' ? '† no longer answers'
    : host ? hostLabel(host)
    : '⌀ UNSUMMONED'

  const className = [
    'card',
    `card--${tier}`,
    href ? 'card--linked' : 'card--inert',
    overridden ? 'card--overridden' : ''
  ].filter(Boolean).join(' ')

  const body = (
    <>
      <span className="card__name">{name}</span>
      <span className="card__blurb">{blurb}</span>
      <span className="card__meta">{meta}</span>
      {note && <span className="card__note">{note}</span>}
    </>
  )

  const shared = {
    className,
    draggable,
    onDragStart: () => onDragStart(slug),
    'data-slug': slug
  }

  return href
    ? <a {...shared} href={href} rel="noreferrer">{body}</a>
    : <div {...shared}>{body}</div>
}
