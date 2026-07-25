import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TierSection } from './TierSection'
import type { Project } from '../types'

const projects: Project[] = [
  { slug: 'a', name: 'A', blurb: 'one', tier: 'living' },
  { slug: 'b', name: 'B', blurb: 'two', tier: 'living' }
]

const noop = () => {}

describe('TierSection', () => {
  it('renders the rank name, glyph and realm count', () => {
    render(<TierSection tier="living" projects={projects} hostBySlug={{}} editing={false} overrides={{}} onDragStart={noop} onDrop={noop} />)
    expect(screen.getByText(/THE LIVING/)).toBeInTheDocument()
    expect(screen.getByText(/2 realms/)).toBeInTheDocument()
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
})
