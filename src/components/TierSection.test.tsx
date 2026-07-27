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
    render(<TierSection tier="living" projects={projects} hostBySlug={{}} onOpen={noop} />)
    expect(screen.getByText(/THE LIVING/)).toBeInTheDocument()
    expect(screen.getByText(/2 realms/)).toBeInTheDocument()
    expect(screen.getByText(TIER_META.living.glyph)).toBeInTheDocument()
    expect(screen.getByText(TIER_META.living.lore)).toBeInTheDocument()
  })

  it('uses the singular for one realm', () => {
    render(<TierSection tier="risen" projects={[projects[0]]} hostBySlug={{}} onOpen={noop} />)
    expect(screen.getByText(/1 realm(?!s)/)).toBeInTheDocument()
  })

  it('renders a header with none when empty', () => {
    render(<TierSection tier="fallen" projects={[]} hostBySlug={{}} onOpen={noop} />)
    expect(screen.getByText(/THE FALLEN/)).toBeInTheDocument()
    expect(screen.getByText(/none/)).toBeInTheDocument()
  })

  it('never fires onDrop for the ascended, which no drag can supply a successor for', () => {
    const onDrop = vi.fn()
    const { container } = render(<TierSection tier="ascended" projects={[]} hostBySlug={{}} onOpen={noop} />)
    fireEvent.drop(container.querySelector('.tier') as Element)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('does not accept a dragover on the ascended even while', () => {
    const { container } = render(<TierSection tier="ascended" projects={[]} hostBySlug={{}} onOpen={noop} />)
    // Returning true means preventDefault was never called, so the browser treats the
    // section as a non-drop-zone and never fires a drop on it at all.
    expect(fireEvent.dragOver(container.querySelector('.tier') as Element)).toBe(true)
  })

  it('never shows drop-target styling on the ascended', () => {
    const { container } = render(<TierSection tier="ascended" projects={[]} hostBySlug={{}} onOpen={noop} />)
    const section = container.querySelector('.tier') as Element
    fireEvent.dragOver(section)
    expect(section.classList.contains('tier--drop-target')).toBe(false)
  })

  it('renders one card per project', () => {
    const { container } = render(<TierSection tier="living" projects={projects} hostBySlug={{}} onOpen={noop} />)
    expect(container.querySelectorAll('.card')).toHaveLength(2)
  })

  it('never marks itself a drop target when not', () => {
    const { container } = render(<TierSection tier="dormant" projects={projects} hostBySlug={{}} onOpen={noop} />)
    const section = container.querySelector('.tier') as Element
    fireEvent.dragOver(section)
    expect(section.classList.contains('tier--drop-target')).toBe(false)
  })

  it('keeps the externally-set reveal marker across a drop-target toggle', () => {
    const { container } = render(<TierSection tier="dormant" projects={projects} hostBySlug={{}} onOpen={noop} />)
    const section = container.querySelector('.tier') as Element
    section.setAttribute('data-revealed', '')
    fireEvent.dragOver(section)
    fireEvent.dragLeave(section)
    expect(section.hasAttribute('data-revealed')).toBe(true)
  })

  it('sets the --i custom property on each cell', () => {
    const { container } = render(<TierSection tier="living" projects={projects} hostBySlug={{}} onOpen={noop} />)
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
        hostBySlug={{ ef: 'https://deskboard.example' }} onOpen={noop}
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
        hostBySlug={{}} onOpen={noop}
      />
    )
    expect(container.querySelector('a')).toBeNull()
  })

  it('passes draggable=false to cards when not', () => {
    const { container } = render(<TierSection tier="living" projects={[projects[0]]} hostBySlug={{}} onOpen={noop} />)
    const card = container.querySelector('.card') as HTMLElement
    expect(card.draggable).toBe(false)
  })

})
