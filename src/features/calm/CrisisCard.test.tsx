// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import hotlines from '../../data/safety/hotlines.json'
import CrisisCard from './CrisisCard'
afterEach(cleanup)

describe('CrisisCard', () => {
  it('Call 911 is a real tel link with a 44 px target, even with no rows', () => {
    render(<CrisisCard rows={[]} />)
    const a = screen.getByRole('link', { name: 'Call 911' })
    expect(a.getAttribute('href')).toBe('tel:911')
    expect(a.className).toMatch(/cm-911/)
    expect(screen.queryByText(/Call 1553/)).toBeNull()
  })
  it('shows the first row name as given, not a hand-typed promise', () => {
    render(<CrisisCard />)
    expect(screen.getByText('NCMH Crisis Hotline (24/7, landline toll-free)')).toBeTruthy()
    expect(screen.queryByText(/free to call/)).toBeNull()
  })
  it('labels each mobile number with its network', () => {
    render(<CrisisCard />)
    expect(screen.getByRole('link', { name: /0917-899-8727.*Globe\/TM/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /0919-057-1553.*Smart\/TNT/ })).toBeTruthy()
  })
  it('an UNKNOWN row is not shown', () => {
    const ncmh = hotlines.find((r) => r.id === 'hl-ncmh')!
    render(<CrisisCard rows={[{ ...ncmh, status: 'UNKNOWN' }]} />)
    expect(screen.queryByText(/1553/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Call 911' })).toBeTruthy()
  })
})
