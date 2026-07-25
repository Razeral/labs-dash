import { useEffect, useMemo, useRef, useState } from 'react'
import { TierSection } from './components/TierSection'
import { EditBar } from './components/EditBar'
import type { CopyState } from './components/EditBar'
import { readOverrides, writeOverride, clearOverrides, applyOverrides, exportRoster } from './overrides'
import { isEditEnabled } from './auth'
import { TIERS } from './types'
import type { Project, Tier } from './types'
import seed from './data/projects.json'
import './styles/tokens.css'
import './styles/app.css'

const roster = seed as Project[]
const OWNER = import.meta.env.VITE_OWNER_EMAIL ?? ''
const COPY_STATUS_TIMEOUT_MS = 2000

export const App = () => {
  const [overrides, setOverrides] = useState(() => readOverrides())
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const dragged = useRef<string | null>(null)
  const copyTimer = useRef<number | null>(null)

  const editing = useMemo(
    () => isEditEnabled(document.cookie, window.location.search, OWNER),
    []
  )

  const resolved = useMemo(() => applyOverrides(roster, overrides), [overrides])

  const hostBySlug = useMemo(
    () => Object.fromEntries(roster.filter((p) => p.host).map((p) => [p.slug, p.host as string])),
    []
  )

  // The reveal marker is an attribute, not a class. TierSection's className is
  // React-owned and is rewritten whenever it toggles `tier--drop-target`, which
  // would silently wipe a class added here and strand the rank at opacity 0.
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

  // Cursor-tracked ember on the hovered card. Skipped entirely for reduced
  // motion and for coarse pointers, where there is no cursor to track.
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

    // A card that keeps stale --mx/--my re-ignites at the last mouse position
    // when it is re-entered or keyboard-focused. Clearing them restores the
    // 50% 0% fallback in app.css.
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

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
  }, [])

  const flashCopyState = (state: 'copied' | 'failed') => {
    setCopyState(state)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyState('idle'), COPY_STATUS_TIMEOUT_MS)
  }

  const handleDrop = (tier: Tier) => {
    const slug = dragged.current
    dragged.current = null
    if (!slug || !editing) return
    setOverrides(writeOverride(slug, tier))
  }

  const handleCopy = () => {
    if (!navigator.clipboard) {
      flashCopyState('failed')
      return
    }
    navigator.clipboard.writeText(exportRoster(roster, overrides))
      .then(() => flashCopyState('copied'))
      .catch(() => flashCopyState('failed'))
  }

  const handleReset = () => {
    clearOverrides()
    setOverrides({})
  }

  return (
    <main className="board">
      <header className="board__header">
        <h1 className="board__title">The Labs</h1>
        <p className="board__sub">A bestiary of {roster.length} works, ranked by vitality.</p>
      </header>

      {editing && (
        <EditBar
          changeCount={Object.keys(overrides).length}
          copyState={copyState}
          onCopy={handleCopy}
          onReset={handleReset}
        />
      )}

      {TIERS.map((tier) => (
        <TierSection
          key={tier}
          tier={tier}
          projects={resolved.filter((p) => p.tier === tier)}
          hostBySlug={hostBySlug}
          editing={editing}
          overrides={overrides}
          onDragStart={(slug) => { dragged.current = slug }}
          onDrop={handleDrop}
        />
      ))}
    </main>
  )
}
