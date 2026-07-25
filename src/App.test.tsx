import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import { STORAGE_KEY } from './overrides'
import { TIERS, TIER_META } from './types'
import { roster, allProjects } from './data/roster'
import type { Project } from './types'
import { FakeIntersectionObserver } from './test-setup'
import * as auth from './auth'

const enableEditing = () => vi.spyOn(auth, 'isEditEnabled').mockReturnValue(true)

const stubClipboard = (writeText: ReturnType<typeof vi.fn>) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

beforeEach(() => {
  localStorage.clear()
  FakeIntersectionObserver.instances = []
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('App', () => {
  it('renders all five ranks in vitality order', () => {
    const { container } = render(<App />)
    const names = [...container.querySelectorAll('.tier__name')].map((n) => n.textContent)
    expect(names).toEqual(TIERS.map((t) => TIER_META[t].name))
  })

  it('renders every project as a card', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('.card')).toHaveLength(roster.length)
  })

  it('hides the edit bar by default', () => {
    render(<App />)
    expect(screen.queryByText(/copy projects.json/i)).toBeNull()
  })

  it('places an overridden project under its override tier', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ govbrain: 'fallen' }))
    const { container } = render(<App />)
    const fallen = container.querySelector('.tier--fallen')
    expect(fallen?.querySelector('[data-slug="govbrain"]')).not.toBeNull()
  })

  it('counts realms consistently with the cards rendered', () => {
    const { container } = render(<App />)
    for (const section of container.querySelectorAll('.tier')) {
      const cards = section.querySelectorAll('.card').length
      const label = section.querySelector('.tier__count')?.textContent ?? ''
      if (cards === 0) expect(label).toBe('none')
      else expect(label).toBe(`${cards} realm${cards === 1 ? '' : 's'}`)
    }
  })

  it('drags a card into a new tier and persists the override', () => {
    enableEditing()
    const { container, unmount } = render(<App />)

    const card = container.querySelector('[data-slug="govbrain"]') as HTMLElement
    const livingSection = container.querySelector('.tier--living') as HTMLElement
    const fallenSection = container.querySelector('.tier--fallen') as HTMLElement
    const livingCountBefore = livingSection.querySelectorAll('.card').length
    const fallenCountBefore = fallenSection.querySelectorAll('.card').length

    fireEvent.dragStart(card)
    fireEvent.drop(fallenSection)

    expect(fallenSection.querySelector('[data-slug="govbrain"]')).not.toBeNull()
    expect(livingSection.querySelectorAll('.card')).toHaveLength(livingCountBefore - 1)
    expect(fallenSection.querySelectorAll('.card')).toHaveLength(fallenCountBefore + 1)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ govbrain: 'fallen' })

    unmount()
    const { container: reloaded } = render(<App />)
    const fallenAfterReload = reloaded.querySelector('.tier--fallen')
    expect(fallenAfterReload?.querySelector('[data-slug="govbrain"]')).not.toBeNull()
  })

  it('leaves a card where it was when dropped on the ascended', () => {
    enableEditing()
    const { container } = render(<App />)

    const card = container.querySelector('[data-slug="govbrain"]') as HTMLElement
    const living = container.querySelector('.tier--living') as HTMLElement
    const ascended = container.querySelector('.tier--ascended') as HTMLElement
    const ascendedCountBefore = ascended.querySelectorAll('.card').length

    fireEvent.dragStart(card)
    fireEvent.drop(ascended)

    expect(living.querySelector('[data-slug="govbrain"]')).not.toBeNull()
    expect(ascended.querySelector('[data-slug="govbrain"]')).toBeNull()
    expect(ascended.querySelectorAll('.card')).toHaveLength(ascendedCountBefore)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('never renders the literal string undefined on any card', () => {
    enableEditing()
    const { container } = render(<App />)
    const ascended = container.querySelector('.tier--ascended') as HTMLElement
    fireEvent.dragStart(ascended.querySelector('.card') as Element)
    fireEvent.drop(container.querySelector('.tier--ascended') as HTMLElement)
    expect(container.textContent).not.toMatch(/undefined/)
  })

  it('clears absorbedInto when an ascended card is dragged out, keeping the export valid', async () => {
    enableEditing()
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    const { container } = render(<App />)

    const ascended = container.querySelector('.tier--ascended') as HTMLElement
    const card = ascended.querySelector('.card') as HTMLElement
    const slug = card.getAttribute('data-slug') as string
    const dormant = container.querySelector('.tier--dormant') as HTMLElement

    fireEvent.dragStart(card)
    fireEvent.drop(dormant)

    const moved = dormant.querySelector(`[data-slug="${slug}"]`) as HTMLElement
    expect(moved).not.toBeNull()
    expect(moved.textContent).not.toMatch(/ascended into/)
    expect(moved.textContent).not.toMatch(/undefined/)

    fireEvent.click(screen.getByText(/copy projects.json/i))
    await screen.findByText(/^copied$/i)
    const payload = (JSON.parse(writeText.mock.calls[0][0] as string) as { omit: string[]; projects: Project[] }).projects as Project[]

    // The exported roster is pasted back into src/data/projects.json, so it must still pass
    // the ascended-iff-absorbedInto invariant that projects.test.ts enforces there.
    expect(payload.find((p) => p.slug === slug)?.absorbedInto).toBeUndefined()
    for (const p of payload) {
      if (p.tier === 'ascended') expect(p.absorbedInto?.name).toBeTruthy()
      else expect(p.absorbedInto).toBeUndefined()
    }
  })

  it('renders the seed board instead of blanking when localStorage throws', () => {
    // A managed-browser policy or blocked site data makes the getter itself throw. This ran
    // inside a useState initialiser with no error boundary above it, so the throw escaped
    // render and left #root empty with no message.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.')
    })
    const { container } = render(<App />)
    expect(container.querySelectorAll('.card')).toHaveLength(roster.length)
    expect(container.querySelectorAll('.tier')).toHaveLength(5)
  })

  it('counts only overrides for slugs still on the roster', () => {
    enableEditing()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ govbrain: 'fallen', 'ghost-project': 'risen' }))
    render(<App />)
    expect(screen.getByText(/1 local change/i)).toBeInTheDocument()
  })

  it('copies the roster to the clipboard reflecting an active override', async () => {
    enableEditing()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ govbrain: 'fallen' }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    render(<App />)
    fireEvent.click(screen.getByText(/copy projects.json/i))

    await screen.findByText(/^copied$/i)
    expect(writeText).toHaveBeenCalledTimes(1)
    const payload = (JSON.parse(writeText.mock.calls[0][0] as string) as { omit: string[]; projects: Project[] }).projects
    expect(payload).toHaveLength(allProjects.length)
    expect(payload.find((p) => p.slug === 'govbrain')?.tier).toBe('fallen')
  })

  it('shows a failed state when the clipboard write rejects, without throwing', async () => {
    enableEditing()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    stubClipboard(writeText)

    render(<App />)
    fireEvent.click(screen.getByText(/copy projects.json/i))

    await screen.findByText(/copy failed/i)
  })

  it('goes straight to the failed state when the clipboard API is absent', async () => {
    enableEditing()
    Reflect.deleteProperty(navigator, 'clipboard')

    render(<App />)
    fireEvent.click(screen.getByText(/copy projects.json/i))

    await screen.findByText(/copy failed/i)
  })

  it('resets overrides back to seed tiers and clears localStorage', () => {
    enableEditing()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ govbrain: 'fallen' }))
    const { container } = render(<App />)

    expect(container.querySelector('.tier--fallen')?.querySelector('[data-slug="govbrain"]')).not.toBeNull()

    fireEvent.click(screen.getByText(/reset overrides/i))

    expect(container.querySelector('.tier--living')?.querySelector('[data-slug="govbrain"]')).not.toBeNull()
    expect(container.querySelector('.tier--fallen')?.querySelector('[data-slug="govbrain"]')).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('observes every tier section, reveals on intersection, and disconnects on unmount', () => {
    const { container, unmount } = render(<App />)
    const sections = [...container.querySelectorAll('.tier')]
    const io = FakeIntersectionObserver.instances.at(-1)

    expect(io).toBeDefined()
    expect(io?.observe).toHaveBeenCalledTimes(5)

    const target = sections[0]
    io?.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry])
    expect(target.hasAttribute('data-revealed')).toBe(true)

    unmount()
    expect(io?.disconnect).toHaveBeenCalledTimes(1)
  })

  it('keeps a revealed rank revealed when a drag rewrites its class attribute', () => {
    // Deliberately accepts either marker. The point of this test is not which
    // mechanism marks a rank revealed, it is that the mark SURVIVES a React
    // re-render. Pinning the attribute here would make the test fail at the
    // first assertion if the marker moved back to a class, which would hide
    // the erasure this guards.
    const isRevealed = (el: Element) =>
      el.hasAttribute('data-revealed') || el.classList.contains('is-revealed')

    enableEditing()
    const { container } = render(<App />)
    const section = container.querySelector('.tier--living') as HTMLElement
    const io = FakeIntersectionObserver.instances.at(-1)

    io?.callback([{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry])
    expect(isRevealed(section)).toBe(true)

    // Dragging toggles `tier--drop-target`, so React rewrites the whole class
    // attribute — twice. The observer never re-fires for an element that is
    // already intersecting, so anything React erases here strands the rank at
    // opacity 0 permanently: a blank section, with every other test passing.
    fireEvent.dragStart(section.querySelector('.card') as Element)
    fireEvent.dragOver(section)
    expect(section.classList.contains('tier--drop-target')).toBe(true)

    fireEvent.dragLeave(section)
    expect(section.classList.contains('tier--drop-target')).toBe(false)

    expect(isRevealed(section)).toBe(true)
  })
})
