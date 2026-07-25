import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TierSection } from './TierSection'
import { TIER_META } from '../types'
import type { Project } from '../types'

const projects: Project[] = [
  { slug: 'a', name: 'A', blurb: 'one', tier: 'living' },
  { slug: 'b', name: 'B', blurb: 'two', tier: 'living' }
]

const noop = () => {}

describe('TierSection', () => {
  it('renders the rank name, glyph, lore and realm count', () => {
    render(<TierSection tier="living" projects={projects} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    expect(screen.getByText(/THE LIVING/)).toBeInTheDocument()
    expect(screen.getByText(/2 realms/)).toBeInTheDocument()
    expect(screen.getByText(TIER_META.living.glyph)).toBeInTheDocument()
    expect(screen.getByText(TIER_META.living.lore)).toBeInTheDocument()
  })

  it('uses the singular for one realm', () => {
    render(<TierSection tier="risen" projects={[projects[0]]} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    expect(screen.getByText(/1 realm(?!s)/)).toBeInTheDocument()
  })

  it('renders a header with none when empty', () => {
    render(<TierSection tier="fallen" projects={[]} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    expect(screen.getByText(/THE FALLEN/)).toBeInTheDocument()
    expect(screen.getByText(/none/)).toBeInTheDocument()
  })

  it('fires onDrop with its own tier when a card is dropped on it', () => {
    const onDrop = vi.fn()
    const { container } = render(<TierSection tier="dormant" projects={[]} hostBySlug={{}} editing overrides={{}} onDragStart={noop} onDrop={onDrop} />)
    fireEvent.drop(container.querySelector('.tier') as Element)
    expect(onDrop).toHaveBeenCalledWith('dormant')
  })

  it('renders one card per project', () => {
    const { container } = render(<TierSection tier="living" projects={projects} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    expect(container.querySelectorAll('.card')).toHaveLength(2)
  })

  it('permits a drop only while editing', () => {
    const { container, rerender } = render(<TierSection tier="living" projects={[]} hostBySlug={{}} editing overrides={{}} onDragStart={noop} onDrop={noop} />)
    const section = container.querySelector('.tier') as Element
    expect(fireEvent.dragOver(section)).toBe(false)

    rerender(<TierSection tier="living" projects={[]} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    expect(fireEvent.dragOver(section)).toBe(true)
  })

  it('sets the --i custom property on each cell', () => {
    const { container } = render(<TierSection tier="living" projects={projects} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    const cells = Array.from(container.querySelectorAll('.tier__cell')) as HTMLElement[]
    expect(cells[0].style.getPropertyValue('--i')).toBe('0')
    expect(cells[1].style.getPropertyValue('--i')).toBe('1')
  })

  it('resolves successorHost from hostBySlug for absorbed projects', () => {
    const absorbedProject: Project = {
      slug: 'ab',
      name: 'Absorbed',
      blurb: 'was here',
      tier: 'ascended',
      absorbedInto: { name: 'deskboard', slug: 'ef' }
    }
    const { container } = render(
      <TierSection
        tier="ascended"
        projects={[absorbedProject]}
        hostBySlug={{ ef: 'https://deskboard.example' }}
        editing={false}
        overrides={{}}
        onDragStart={noop}
        onDrop={noop}
      />
    )
    const link = container.querySelector('a') as HTMLAnchorElement
    expect(link.href).toBe('https://deskboard.example/')
  })

  it('renders no link when successorHost is not found', () => {
    const absorbedProject: Project = {
      slug: 'cd',
      name: 'Orphaned',
      blurb: 'lost heir',
      tier: 'ascended',
      absorbedInto: { name: 'missing-board' }
    }
    const { container } = render(
      <TierSection
        tier="ascended"
        projects={[absorbedProject]}
        hostBySlug={{}}
        editing={false}
        overrides={{}}
        onDragStart={noop}
        onDrop={noop}
      />
    )
    expect(container.querySelector('a')).toBeNull()
  })

  it('passes draggable=true to cards when editing', () => {
    const { container } = render(<TierSection tier="living" projects={[projects[0]]} hostBySlug={{}} editing overrides={{}} onDragStart={noop} onDrop={noop} />)
    const card = container.querySelector('.card') as HTMLElement
    expect(card.draggable).toBe(true)
  })

  it('passes draggable=false to cards when not editing', () => {
    const { container } = render(<TierSection tier="living" projects={[projects[0]]} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    const card = container.querySelector('.card') as HTMLElement
    expect(card.draggable).toBe(false)
  })

  it('marks overridden cards with card--overridden class', () => {
    const { container } = render(
      <TierSection
        tier="living"
        projects={[projects[0]]}
        hostBySlug={{}}
        editing={false}
        overrides={{ a: 'ascended' }}
        onDragStart={noop}
        onDrop={noop}
      />
    )
    const card = container.querySelector('.card') as HTMLElement
    expect(card.classList.contains('card--overridden')).toBe(true)
  })

  it('does not mark non-overridden cards with card--overridden class', () => {
    const { container } = render(
      <TierSection
        tier="living"
        projects={[projects[0]]}
        hostBySlug={{}}
        editing={false}
        overrides={{}}
        onDragStart={noop}
        onDrop={noop}
      />
    )
    const card = container.querySelector('.card') as HTMLElement
    expect(card.classList.contains('card--overridden')).toBe(false)
  })
})
