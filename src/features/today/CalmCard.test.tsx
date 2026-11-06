import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ acting: false, log: [] as { at: string }[] }))
vi.mock('../shell/useKv', () => ({ useKv: () => [h.log, () => undefined, true] }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: null, name: '' }) }))
import CalmCard from './CalmCard'

afterEach(() => { cleanup(); h.acting = false; h.log = [] })

describe('CalmCard sphere (S22-C)', () => {
  it('the 84 px orb is the dotted sphere on a glow, not rings', () => {
    const { container } = render(<CalmCard />)
    expect(container.querySelectorAll('.bo-orb ellipse').length).toBe(7)
    expect(container.querySelector('.bo-glow')).not.toBeNull()
    expect(container.querySelector('.bo-orb i')).toBeNull()
    expect((container.querySelector('.bo') as HTMLElement).style.width).toBe('84px')
  })
})

describe('CalmCard opens the full Calm screen (D-142)', () => {
  it('the card is a navy link to #calm and no sheet opens', () => {
    render(<CalmCard />)
    const a = screen.getByRole('link', { name: 'Breathe for 1 minute' })
    expect(a.getAttribute('href')).toBe('#calm')
    expect(a.classList.contains('cc-navy')).toBe(true)
    fireEvent.click(a)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('CalmCard done today', () => {
  it('own breath today reads Done today', () => {
    h.log = [{ at: new Date().toISOString() }]
    render(<CalmCard />)
    expect(screen.getByText(/Done today\./)).toBeTruthy()
  })
  it("while an admin views as someone, the admin's own breath is not the viewed person's: Not done yet today", () => {
    h.log = [{ at: new Date().toISOString() }]; h.acting = true
    render(<CalmCard />)
    expect(screen.getByText(/Not done yet today\./)).toBeTruthy()
  })
})
