import { useEffect, useMemo, useState } from 'react'
import { TierSection } from './components/TierSection'
import { Backdrop } from './components/Backdrop'
import { Hero } from './components/Hero'
import { ProjectModal } from './components/ProjectModal'
import { TIERS } from './types'
import type { Tier } from './types'
import { roster } from './data/roster'
import { cardArt } from './data/cardArt'
import './styles/tokens.css'
import './styles/app.css'

export const App = () => {
  const [activeTier, setActiveTier] = useState<Tier>('living')
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  // Art belongs to every rank that still has something to show. A living project needs a
  // host — art is for something you can go and see. The ascended, dormant and risen get art
  // without one: the ascended because they graduated, the dormant because they are still
  // standing, the risen because something is still running in there. Only The Fallen stays
  // bare, and that is the point of it — a tombstone with a scene would stop reading as a
  // tombstone. The art itself carries the rank's mood, so the ranks stay distinguishable
  // without withholding it.
  const artBySlug = useMemo(
    () => Object.fromEntries(
      roster
        .filter((p) => p.tier !== 'fallen' && (p.tier !== 'living' || p.host) && cardArt[p.slug])
        .map((p) => [p.slug, cardArt[p.slug]])
    ),
    []
  )

  const hostBySlug = useMemo(
    () => Object.fromEntries(roster.filter((p) => p.host).map((p) => [p.slug, p.host as string])),
    []
  )

  const openProject = useMemo(
    () => (openSlug ? roster.find((p) => p.slug === openSlug) ?? null : null),
    [openSlug]
  )

  // Which rank owns the backdrop. A narrow band around the viewport's middle means exactly
  // one section is "current" at a time, so the backdrop crossfades as a rank scrolls through
  // the centre rather than flickering at every section boundary.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const sections = [...document.querySelectorAll('.tier')]
    if (sections.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const tier = TIERS.find((t) => e.target.classList.contains(`tier--${t}`))
          if (tier) setActiveTier(tier)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' }
    )
    sections.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // The reveal marker is an attribute, not a class, so that a React re-render of a section
  // cannot wipe it and strand the rank at opacity 0.
  useEffect(() => {
    const els = document.querySelectorAll('.tier')
    const reveal = (el: Element) => el.setAttribute('data-revealed', '')
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(reveal)
      return
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && reveal(e.target)),
      { rootMargin: '0px 0px -10% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Cursor-tracked ember on the hovered card. Skipped entirely for reduced motion and for
  // coarse pointers, where there is no cursor to track.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const skip =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(pointer: coarse)').matches
    if (skip) return

    const board = document.querySelector('.board')
    if (!board) return

    let frame = 0
    let pending: PointerEvent | null = null
    let lit: HTMLElement | null = null

    // A card that keeps stale --mx/--my re-ignites at the last mouse position when it is
    // re-entered or keyboard-focused. Clearing them restores the 50% 0% fallback in app.css.
    const douse = () => {
      if (!lit) return
      lit.style.removeProperty('--mx')
      lit.style.removeProperty('--my')
      lit = null
    }

    const paint = () => {
      frame = 0
      const event = pending
      pending = null
      if (!event) return
      const target = event.target as Element | null
      const card = target?.closest?.('.card') as HTMLElement | null
      if (card !== lit) douse()
      if (!card) return
      const box = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${event.clientX - box.left}px`)
      card.style.setProperty('--my', `${event.clientY - box.top}px`)
      lit = card
    }

    const onMove = (event: Event) => {
      pending = event as PointerEvent
      if (!frame) frame = requestAnimationFrame(paint)
    }

    const onLeave = () => {
      pending = null
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      douse()
    }

    board.addEventListener('pointermove', onMove)
    board.addEventListener('pointerleave', onLeave)
    return () => {
      board.removeEventListener('pointermove', onMove)
      board.removeEventListener('pointerleave', onLeave)
      if (frame) cancelAnimationFrame(frame)
      douse()
    }
  }, [])

  return (
    <>
      <Backdrop active={activeTier} />
      <Hero count={roster.length} />
      <main className="board">
        {TIERS.map((tier) => (
          <TierSection
            key={tier}
            tier={tier}
            projects={roster.filter((p) => p.tier === tier)}
            hostBySlug={hostBySlug}
            artBySlug={artBySlug}
            onOpen={setOpenSlug}
          />
        ))}
      </main>
      {openProject && (
        <ProjectModal
          project={openProject}
          art={cardArt[openProject.slug]}
          href={
            openProject.tier === 'fallen'
              ? undefined
              : openProject.tier === 'ascended'
                // Mirrors Card: an ascended project's own host wins; the successor's is the
                // fallback for a graduate that no longer serves anything itself.
                ? openProject.host ??
                  (openProject.absorbedInto?.slug ? hostBySlug[openProject.absorbedInto.slug] : undefined)
                : openProject.host
          }
          onClose={() => setOpenSlug(null)}
        />
      )}
    </>
  )
}
