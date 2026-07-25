import { useEffect, useRef } from 'react'
import type { Project } from '../types'
import { TIER_META } from '../types'

type Props = {
  project: Project
  art?: string
  href?: string
  onClose: () => void
}

// The detail view. Clicking a card body opens this; the host line on the card itself stays a
// plain link so "just take me there" never costs an extra click.
export const ProjectModal = ({ project, art, href, onClose }: Props) => {
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreTo = useRef<Element | null>(null)

  useEffect(() => {
    restoreTo.current = document.activeElement
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)

    // The board behind must not scroll while a dialog is over it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      // Returning focus to the card that opened this is what makes keyboard use coherent.
      ;(restoreTo.current as HTMLElement | null)?.focus?.()
    }
  }, [onClose])

  const { name, blurb, tier, note, absorbedInto } = project
  const rank = TIER_META[tier]

  return (
    <div
      className="modal"
      role="presentation"
      onClick={(e) => {
        // Only a click on the backdrop itself closes — not one that bubbled from the panel.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {art && (
          <div className="modal__art" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" />
        )}

        <div className="modal__body">
          <p className="modal__rank">
            <span aria-hidden="true">{rank.glyph}</span> {rank.name}
          </p>
          <h2 className="modal__title" id="modal-title">{name}</h2>
          <p className="modal__blurb">{blurb}</p>
          {absorbedInto && (
            <p className="modal__note">⟶ ascended into {absorbedInto.name}</p>
          )}
          {note && <p className="modal__note">{note}</p>}

          <div className="modal__actions">
            {href ? (
              <a className="modal__go" href={href} rel="noreferrer">
                {new URL(href).hostname}
                <span aria-hidden="true"> ↗</span>
              </a>
            ) : (
              <span className="modal__go modal__go--none">
                {tier === 'fallen' ? '† no longer answers' : '⌀ UNSUMMONED'}
              </span>
            )}
            <button ref={closeRef} type="button" className="modal__close" onClick={onClose}>
              close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
