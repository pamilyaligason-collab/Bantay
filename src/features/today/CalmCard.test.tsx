import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ acting: false, log: [] as { at: string }[] }))
vi.mock('../shell/useKv', () => ({ useKv: () => [h.log, () => undefined, true] }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: null, name: '' }) }))
vi.mock('./BreathSheet', () => ({ default: () => null }))
import CalmCard from './CalmCard'

afterEach(() => { cleanup(); h.acting = false; h.log = [] })

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
