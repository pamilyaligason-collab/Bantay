// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FirstAidGrid } from './SafetyHub'

describe('Safety home first aid grid', () => {
  it('shows 6 cards, then every topic on Show more, focus stays on the button, Show less goes back', async () => {
    render(<FirstAidGrid />)
    const links = () => screen.getAllByRole('link')
    expect(links()).toHaveLength(6)
    // hand-written: the 4 quick cards (Stroke first, D-128), then the first two other topics in file order
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['stroke', 'cpr', 'choking', 'dengue-warning-signs', 'bleeding', 'heart-attack'].map((id) => `#safety/firstaid/${id}`))
    expect(links()[4].textContent).toContain('Heavy bleeding')
    expect(links()[5].textContent).toContain('Heart attack')
    const btn = screen.getByRole('button', { name: 'Show more' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(btn)
    expect(links()).toHaveLength(17)
    // hand-written from the board: after the 4 quick cards the rest follow the All topics order, with its tints
    const ids = links().map((a) => a.getAttribute('href')!.split('/').pop())
    expect(ids.slice(0, 8)).toEqual(['stroke', 'cpr', 'choking', 'dengue-warning-signs', 'bleeding', 'heart-attack', 'burns', 'heat-stroke'])
    expect(ids.slice(8)).toEqual(['seizure', 'fainting', 'fracture', 'drowning', 'snake-bite', 'dog-bite-rabies', 'low-sugar', 'allergic-reaction', 'falls'])
    const tint = (id: string) => links().find((a) => a.getAttribute('href') === `#safety/firstaid/${id}`)!.getAttribute('data-tint')
    expect([tint('burns'), tint('seizure'), tint('fainting'), tint('snake-bite'), tint('low-sugar'), tint('falls')]).toEqual(['amber', 'purple', 'blue', 'green', 'teal', 'teal'])
    expect(btn.textContent).toBe('Show less')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    // a title that already says the Filipino name shows once: no sub line under Heat stroke
    const heat = links().find((a) => a.getAttribute('href') === '#safety/firstaid/heat-stroke')!
    expect(heat.textContent).toBe('Heat stroke')
    expect(screen.getAllByText('Heat stroke')).toHaveLength(1)
    expect(document.activeElement).toBe(btn)
    await userEvent.click(btn)
    expect(links()).toHaveLength(6)
    expect(document.activeElement).toBe(btn)
  })
})
