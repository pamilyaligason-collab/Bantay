import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const abroad = vi.hoisted(() => ({ v: false }))
vi.mock('./Call911', () => ({ useAbroad: () => abroad.v, Call911: () => null }))
import { OutsideCover } from './SafetyPages'
afterEach(cleanup)

describe('OutsideCover (map page away from our areas)', () => {
  it('in the Philippines or Texas: barangay or 911', () => {
    abroad.v = false
    render(<OutsideCover />)
    expect(screen.getByRole('status').textContent).toContain('ask your barangay or call 911')
  })
  it('abroad: the local emergency number, never 911', () => {
    abroad.v = true
    render(<OutsideCover />)
    const t = screen.getByRole('status').textContent!
    expect(t).toContain('local emergency number')
    expect(t).not.toContain('911')
  })
})
