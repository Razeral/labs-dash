import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'
import type { Project } from '../types'

const base: Project = { slug: 'x', name: 'X', blurb: 'does a thing', tier: 'living' }

const noop = () => {}

describe('Card', () => {
  it('links to the host when hosted', () => {
    render(<Card project={{ ...base, host: 'https://x.example' }} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://x.example')
  })

  it('marks an unhosted project unsummoned and is not a link', () => {
    render(<Card project={base} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByText(/UNSUMMONED/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('never links a fallen project even with a host', () => {
    render(<Card project={{ ...base, tier: 'fallen', host: 'https://gone.example' }} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links an ascended project to its successor host', () => {
    const p: Project = { ...base, tier: 'ascended', absorbedInto: { name: 'deskboard', slug: 'ef' } }
    render(<Card project={p} successorHost="https://deskboard.example" draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByText(/ascended into deskboard/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://deskboard.example')
  })

  it('does not link an ascended project whose successor is off-roster', () => {
    const p: Project = { ...base, tier: 'ascended', absorbedInto: { name: 'the MCP gateway' } }
    render(<Card project={p} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByText(/ascended into the MCP gateway/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the name and blurb', () => {
    render(<Card project={base} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getByText('does a thing')).toBeInTheDocument()
  })

  it('marks an overridden card', () => {
    const { container } = render(<Card project={base} draggable={false} overridden onDragStart={noop} />)
    expect(container.querySelector('.card--overridden')).not.toBeNull()
  })

  it('shows only the hostname in the meta line while linking to the full url', () => {
    const host = 'https://stg.agents.ai.tech.gov.sg/frontend/hangar/'
    render(<Card project={{ ...base, host }} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', host)
    expect(screen.getByText('stg.agents.ai.tech.gov.sg')).toBeInTheDocument()
    expect(screen.queryByText(/frontend\/hangar/)).toBeNull()
  })

  it('shows fallen meta text for a fallen project', () => {
    render(<Card project={{ ...base, tier: 'fallen', host: 'https://gone.example' }} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByText('† no longer answers')).toBeInTheDocument()
  })

  it('renders note when present and omits it when absent', () => {
    const { rerender } = render(<Card project={{ ...base, note: 'test note' }} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.getByText('test note')).toBeInTheDocument()

    rerender(<Card project={base} draggable={false} overridden={false} onDragStart={noop} />)
    expect(screen.queryByText('test note')).toBeNull()
  })

  it('sets root element classes and data-slug correctly', () => {
    const { container } = render(<Card project={{ ...base, host: 'https://x.example' }} draggable={false} overridden={false} onDragStart={noop} />)
    const root = container.querySelector('a')
    expect(root).toHaveClass('card')
    expect(root).toHaveClass('card--living')
    expect(root).toHaveClass('card--linked')
    expect(root).toHaveAttribute('data-slug', 'x')

    const { container: container2 } = render(<Card project={base} draggable={false} overridden={false} onDragStart={noop} />)
    const root2 = container2.querySelector('div')
    expect(root2).toHaveClass('card')
    expect(root2).toHaveClass('card--living')
    expect(root2).toHaveClass('card--inert')
    expect(root2).toHaveAttribute('data-slug', 'x')
  })
})
