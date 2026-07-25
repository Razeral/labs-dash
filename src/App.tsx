import { useEffect, useMemo, useRef, useState } from 'react'
import { TierSection } from './components/TierSection'
import { EditBar } from './components/EditBar'
import { readOverrides, writeOverride, clearOverrides, applyOverrides, exportRoster } from './overrides'
import { isEditEnabled } from './auth'
import { TIERS } from './types'
import type { Project, Tier } from './types'
import seed from './data/projects.json'
import './styles/tokens.css'
import './styles/app.css'

const roster = seed as Project[]
const OWNER = import.meta.env.VITE_OWNER_EMAIL ?? ''

export const App = () => {
  const [overrides, setOverrides] = useState(() => readOverrides())
  const dragged = useRef<string | null>(null)

  const editing = useMemo(
    () => isEditEnabled(document.cookie, window.location.search, OWNER),
    []
  )

  const resolved = useMemo(() => applyOverrides(roster, overrides), [overrides])

  const hostBySlug = useMemo(
    () => Object.fromEntries(roster.filter((p) => p.host).map((p) => [p.slug, p.host as string])),
    []
  )

  useEffect(() => {
    const els = document.querySelectorAll('.tier')
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-revealed')),
      { rootMargin: '0px 0px -10% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const handleDrop = (tier: Tier) => {
    const slug = dragged.current
    dragged.current = null
    if (!slug || !editing) return
    setOverrides(writeOverride(slug, tier))
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(exportRoster(roster, overrides))
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
