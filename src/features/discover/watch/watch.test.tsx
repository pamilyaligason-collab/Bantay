import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import benefits from '../../../data/discover/benefits.json'
import { playable, VIDEOS } from '../../health/library/videosLogic'
import Watch from './Screen'

afterEach(cleanup)

describe('Watch', () => {
  it('lists every playable video as an outside link, grouped by topic, and never embeds one', () => {
    const { container } = render(<Watch />)
    const links = screen.getAllByRole('link')
    expect(links.length).toBe(VIDEOS.filter(playable).length)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/)
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
    expect(container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Safety' })).toBeTruthy()
    expect(screen.getByText('Live TV is coming.')).toBeTruthy()
  })
})

describe('benefits data', () => {
  it('only the two named benefits, each with an https source and a checked date', () => {
    expect(benefits.benefits.map((b) => b.id)).toEqual(['konsulta', 'senior'])
    for (const b of benefits.benefits) { expect(b.url).toMatch(/^https:\/\//); expect(b.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/) }
  })
})
