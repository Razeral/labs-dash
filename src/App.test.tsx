import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'
import { STORAGE_KEY } from './overrides'
import { TIERS, TIER_META } from './types'

beforeEach(() => localStorage.clear())

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
})
