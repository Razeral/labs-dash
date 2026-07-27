import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { App } from './App'
import { TIERS, TIER_META } from './types'
import { roster } from './data/roster'
import { tierArt } from './data/tierArt'
import { cardArt } from './data/cardArt'
import { FakeIntersectionObserver } from './test-setup'

beforeEach(() => {
  FakeIntersectionObserver.instances = []
})

afterEach(() => {
  vi.restoreAllMocks()
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



  it('counts realms consistently with the cards rendered', () => {
    const { container } = render(<App />)
    for (const section of container.querySelectorAll('.tier')) {
      const cards = section.querySelectorAll('.card').length
      const label = section.querySelector('.tier__count')?.textContent ?? ''
      if (cards === 0) expect(label).toBe('none')
      else expect(label).toBe(`${cards} realm${cards === 1 ? '' : 's'}`)
    }
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

    const { container } = render(<App />)
    const section = container.querySelector('.tier--living') as HTMLElement
    const io = FakeIntersectionObserver.instances.at(-1)

    io?.callback([{ isIntersecting: true, target: section } as unknown as IntersectionObserverEntry])
    expect(isRevealed(section)).toBe(true)

    // Force a React re-render of the section by opening and closing the modal. The
    // observer never re-fires for an element that is already intersecting, so anything
    // React erases here strands the rank at opacity 0 permanently: a blank section, with
    // every other test passing.
    fireEvent.click(section.querySelector('.card__open') as Element)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(isRevealed(section)).toBe(true)
  })

  it('mounts one backdrop layer per rank that has art, with exactly one active', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('.backdrop__layer')).toHaveLength(Object.keys(tierArt).length)
    expect(container.querySelectorAll('.backdrop__layer.is-active')).toHaveLength(tierArt.living ? 1 : 0)
  })


  it('hides the backdrop from assistive tech', () => {
    const { container } = render(<App />)
    const backdrop = container.querySelector('.backdrop')
    if (Object.keys(tierArt).length > 0) {
      expect(backdrop).not.toBeNull()
      expect(backdrop).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('opens a detail modal from a card body and closes it on Escape', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.modal')).toBeNull()

    const card = container.querySelector('[data-slug="govbrain"]') as HTMLElement
    fireEvent.click(card.querySelector('.card__open') as HTMLElement)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('GovBrain')
    // The modal's outbound link must match the card's host, not some other target.
    expect(within(dialog).getByRole('link', { name: /govbrain\.labs/ })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.modal')).toBeNull()
  })

  it('gives a fallen project a detail view with no outbound link', () => {
    const { container } = render(<App />)
    const fallen = container.querySelector('.tier--fallen [data-slug]') as HTMLElement
    fireEvent.click(fallen.querySelector('.card__open') as HTMLElement)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('link')).toBeNull()
    expect(within(dialog).getByText(/no longer answers|UNSUMMONED/)).toBeInTheDocument()
  })

  it('locks the page behind the modal and restores scrolling on close', () => {
    const { container } = render(<App />)
    const card = container.querySelector('[data-slug="govbrain"]') as HTMLElement
    fireEvent.click(card.querySelector('.card__open') as HTMLElement)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('anchors each rank so the hero cue has somewhere to scroll to', () => {
    const { container } = render(<App />)
    // The hero's ENTER cue targets #rank-living; without the id it silently does nothing.
    expect(container.querySelector('#rank-living')).not.toBeNull()
    const cue = container.querySelector('.hero__cue') as HTMLAnchorElement
    const target = cue.getAttribute('href')?.slice(1)
    expect(container.querySelector(`#${target}`)).not.toBeNull()
  })

  it('gives ascended cards art even though they have no host of their own', () => {
    const { container } = render(<App />)
    const ascended = container.querySelectorAll('.tier--ascended [data-slug]')
    expect(ascended.length).toBeGreaterThan(0)
    // Every ascended project with an image on disk must actually render it. They are the one
    // rank that gets art without a host, so a regression here is silent.
    for (const card of ascended) {
      const slug = card.getAttribute('data-slug') as string
      if (cardArt[slug]) expect(card.classList.contains('card--art')).toBe(true)
    }
  })

  it('keeps art off The Fallen alone', () => {
    const { container } = render(<App />)
    // The Fallen is the only rank withheld from: a tombstone carrying a scene stops reading
    // as a tombstone. Every other rank gets art and distinguishes itself by the art's mood.
    for (const card of container.querySelectorAll('.tier--fallen [data-slug]')) {
      expect(card.classList.contains('card--art')).toBe(false)
    }
  })

  it('gives dormant and risen cards art despite having no host', () => {
    const { container } = render(<App />)
    for (const tier of ['dormant', 'risen']) {
      for (const card of container.querySelectorAll(`.tier--${tier} [data-slug]`)) {
        const slug = card.getAttribute('data-slug') as string
        if (cardArt[slug]) expect(card.classList.contains('card--art')).toBe(true)
      }
    }
  })
})
