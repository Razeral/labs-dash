import type { Project } from '../types'

type Props = {
  project: Project
  successorHost?: string
  draggable: boolean
  overridden: boolean
  art?: string
  onDragStart: (slug: string) => void
  onOpen: (slug: string) => void
}

const hostLabel = (host: string) => new URL(host).hostname

export const Card = ({
  project,
  successorHost,
  draggable,
  overridden,
  art,
  onDragStart,
  onOpen
}: Props) => {
  const { slug, name, blurb, tier, host, absorbedInto, note } = project

  const href =
    tier === 'fallen' ? undefined
    : tier === 'ascended' ? successorHost
    : host

  // An ascended card always names its successor in well-formed data (projects.test.ts
  // enforces it). The unnamed branch exists because interpolating a missing name printed the
  // literal string "undefined" on the card — a rendering bug should degrade to the glyph, not
  // to a JavaScript artefact.
  const meta =
    tier === 'ascended' ? (absorbedInto?.name ? `⟶ ascended into ${absorbedInto.name}` : '✦ ascended')
    : tier === 'fallen' ? '† no longer answers'
    : host ? hostLabel(host)
    : '⌀ UNSUMMONED'

  const className = [
    'card',
    `card--${tier}`,
    href ? 'card--linked' : 'card--inert',
    overridden ? 'card--overridden' : '',
    art ? 'card--art' : ''
  ].filter(Boolean).join(' ')

  // Two targets on one card, deliberately. The stretched button covers the whole card and
  // opens the detail view; the host line sits above it and navigates straight out, so
  // "just take me there" never costs an extra click. They are siblings layered by z-index
  // rather than nested, because a link inside a button is invalid HTML and browsers
  // disagree about which one wins the activation.
  //
  // The art is passed as a custom property, not a background shorthand, so the stylesheet
  // keeps control of the scrim the text contrast depends on.
  return (
    <div
      className={className}
      draggable={draggable}
      onDragStart={() => onDragStart(slug)}
      data-slug={slug}
      {...(art ? { style: { ['--art' as string]: `url(${art})` } } : {})}
    >
      <button
        type="button"
        className="card__open"
        onClick={() => onOpen(slug)}
        aria-label={`Details for ${name}`}
      />
      <span className="card__name">{name}</span>
      <span className="card__blurb">{blurb}</span>
      {href ? (
        <a className="card__meta card__meta--link" href={href} rel="noreferrer">{meta}</a>
      ) : (
        <span className="card__meta">{meta}</span>
      )}
      {note && <span className="card__note">{note}</span>}
    </div>
  )
}
