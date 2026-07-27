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

  const isAscended = tier === 'ascended'
  const isFallen = tier === 'fallen'

  // A fallen project's domain is gone, so its recorded host is never a link. Anything else
  // may have one.
  const ownHost = isFallen ? undefined : host

  // An ascended project can be BOTH absorbed and still reachable — harness-site is. Its own
  // host wins over the successor's, because that is where you can actually go; the successor
  // is the fallback for a graduate that no longer serves anything itself.
  const href = isAscended ? ownHost ?? successorHost : ownHost

  // The ascension line is the rank's identity, so it stays the primary line even when the
  // project still has a host of its own — that host gets a second line rather than
  // displacing the thing that explains why the card is in this rank at all.
  const primaryMeta =
    isAscended ? (absorbedInto?.name ? `⟶ ascended into ${absorbedInto.name}` : '✦ ascended')
    : isFallen ? '† no longer answers'
    : ownHost ? hostLabel(ownHost)
    : '⌀ UNSUMMONED'

  const secondaryHost = isAscended && ownHost ? ownHost : undefined

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
      {secondaryHost ? (
        <>
          <span className="card__meta">{primaryMeta}</span>
          <a className="card__meta card__meta--link card__host" href={secondaryHost} rel="noreferrer">
            {hostLabel(secondaryHost)}
          </a>
        </>
      ) : href ? (
        <a className="card__meta card__meta--link" href={href} rel="noreferrer">{primaryMeta}</a>
      ) : (
        <span className="card__meta">{primaryMeta}</span>
      )}
      {note && <span className="card__note">{note}</span>}
    </div>
  )
}
