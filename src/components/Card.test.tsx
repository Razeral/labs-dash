import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Card } from './Card'
import type { Project } from '../types'

const base: Project = { slug: 'x', name: 'X', blurb: 'does a thing', tier: 'living' }

const noop = () => {}

describe('Card', () => {
  it('links to the host when hosted', () => {
    render(<Card project={{ ...base, host: 'https://x.example' }} onOpen={noop} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://x.example')
  })

  it('marks an unhosted project unsummoned and is not a link', () => {
    render(<Card project={base} onOpen={noop} />)
    expect(screen.getByText(/UNSUMMONED/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('never links a fallen project even with a host', () => {
    render(<Card project={{ ...base, tier: 'fallen', host: 'https://gone.example' }} onOpen={noop} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links an ascended project to its successor host', () => {
    const p: Project = { ...base, tier: 'ascended', absorbedInto: { name: 'deskboard', slug: 'ef' } }
    render(<Card project={p} successorHost="https://deskboard.example" onOpen={noop} />)
    expect(screen.getByText(/ascended into deskboard/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://deskboard.example')
  })

  it('falls back to the glyph rather than printing undefined for an unnamed successor', () => {
    render(<Card project={{ ...base, tier: 'ascended' }} onOpen={noop} />)
    expect(screen.getByText('✦ ascended')).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).toBeNull()
  })

  it('does not link an ascended project whose successor is off-roster', () => {
    const p: Project = { ...base, tier: 'ascended', absorbedInto: { name: 'the MCP gateway' } }
    render(<Card project={p} onOpen={noop} />)
    expect(screen.getByText(/ascended into the MCP gateway/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the name and blurb', () => {
    render(<Card project={base} onOpen={noop} />)
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getByText('does a thing')).toBeInTheDocument()
  })

  it('shows only the hostname in the meta line while linking to the full url', () => {
    const host = 'https://stg.agents.ai.tech.gov.sg/frontend/hangar/'
    render(<Card project={{ ...base, host }} onOpen={noop} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', host)
    expect(screen.getByText('stg.agents.ai.tech.gov.sg')).toBeInTheDocument()
    expect(screen.queryByText(/frontend\/hangar/)).toBeNull()
  })

  it('shows fallen meta text for a fallen project', () => {
    render(<Card project={{ ...base, tier: 'fallen', host: 'https://gone.example' }} onOpen={noop} />)
    expect(screen.getByText('† no longer answers')).toBeInTheDocument()
  })

  it('renders note when present and omits it when absent', () => {
    const { rerender } = render(<Card project={{ ...base, note: 'test note' }} onOpen={noop} />)
    expect(screen.getByText('test note')).toBeInTheDocument()

    rerender(<Card project={base} onOpen={noop} />)
    expect(screen.queryByText('test note')).toBeNull()
  })

  it('sets root element classes and data-slug correctly', () => {
    const { container } = render(<Card project={{ ...base, host: 'https://x.example' }} onOpen={noop} />)
    // The root is always a div now: the card carries two controls (the stretched open
    // button and the host link), and a link cannot legally contain a button.
    const root = container.querySelector('[data-slug]')
    expect(root).toHaveClass('card')
    expect(root).toHaveClass('card--living')
    expect(root).toHaveClass('card--linked')
    expect(root).toHaveAttribute('data-slug', 'x')

    const { container: container2 } = render(<Card project={base} onOpen={noop} />)
    const root2 = container2.querySelector('[data-slug]')
    expect(root2).toHaveClass('card')
    expect(root2).toHaveClass('card--living')
    expect(root2).toHaveClass('card--inert')
    expect(root2).toHaveAttribute('data-slug', 'x')
  })

  it('opens the detail view when the card body is clicked', () => {
    const onOpen = vi.fn()
    render(<Card project={{ ...base, host: 'https://x.example' }} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /details for x/i }))
    expect(onOpen).toHaveBeenCalledWith('x')
  })

  it('keeps the host line a direct link that does not open the detail view', () => {
    const onOpen = vi.fn()
    render(<Card project={{ ...base, host: 'https://x.example' }} onOpen={onOpen} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://x.example')
    fireEvent.click(link)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('offers the detail view even for a card that links nowhere', () => {
    const onOpen = vi.fn()
    render(<Card project={base} onOpen={onOpen} />)
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /details for x/i }))
    expect(onOpen).toHaveBeenCalledWith('x')
  })

  it('links an ascended project to its OWN host when it still has one', () => {
    const p: Project = {
      ...base,
      tier: 'ascended',
      host: 'https://still-live.example',
      absorbedInto: { name: 'Successor', slug: 'succ' }
    }
    render(<Card project={p} successorHost="https://successor.example" onOpen={noop} />)
    // The ascension still explains the rank...
    expect(screen.getByText(/ascended into Successor/)).toBeInTheDocument()
    // ...but the live link goes where you can actually go, not to the successor.
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://still-live.example')
    expect(link).toHaveTextContent('still-live.example')
  })

  it('falls back to the successor host when an ascended project serves nothing itself', () => {
    const p: Project = { ...base, tier: 'ascended', absorbedInto: { name: 'Successor', slug: 'succ' } }
    render(<Card project={p} successorHost="https://successor.example" onOpen={noop} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://successor.example')
  })

  it('still refuses a link for a fallen project that records a host', () => {
    const p: Project = { ...base, tier: 'fallen', host: 'https://gone.example' }
    render(<Card project={p} onOpen={noop} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('† no longer answers')).toBeInTheDocument()
  })
})
