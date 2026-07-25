import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from './App'
import { STORAGE_KEY } from './overrides'
import { TIERS, TIER_META } from './types'
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
    expect(container.querySelectorAll('.card')).toHaveLength(49)
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

  it('copies the roster to the clipboard reflecting an active override', async () => {
    enableEditing()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ govbrain: 'fallen' }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    render(<App />)
    fireEvent.click(screen.getByText(/copy projects.json/i))

    await screen.findByText(/^copied$/i)
    expect(writeText).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(writeText.mock.calls[0][0] as string)
    expect(payload).toHaveLength(49)
    expect(payload.find((p: { slug: string }) => p.slug === 'govbrain').tier).toBe('fallen')
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
    expect(target.classList.contains('is-revealed')).toBe(true)

    unmount()
    expect(io?.disconnect).toHaveBeenCalledTimes(1)
  })
})
