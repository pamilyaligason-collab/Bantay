import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DaPrices, DaRow } from '../garden/daPrices'
const h = vi.hoisted(() => ({ d: undefined as DaPrices | null | undefined }))
vi.mock('../garden/daPrices', async (orig) => ({ ...(await orig<typeof import('../garden/daPrices')>()), useDaPrices: () => h.d }))
import PricesCard from './PricesCard'

const r = (commodity: string, price_php: number): DaRow => ({ price_date: '2026-11-08', commodity, specification: '', unit: 'kg', price_php })
const ROWS = [r('Regular Milled Rice', 52), r('Galunggong (Round Scad)', 260), r('Pork Liempo', 380.5), r('Red Onion, Local', 250), r('Okra', 80)]
afterEach(() => { cleanup(); h.d = undefined })

describe('Market prices card', () => {
  it('is hidden while loading, with no list and with an empty list', () => {
    for (const d of [undefined, null, { date: '2026-11-08', rows: [], saved: false }]) {
      h.d = d
      const { container } = render(<PricesCard />)
      expect(container.innerHTML).toBe('')
      cleanup()
    }
  })
  it('shows the four items, the DA label with the date, the local-prices note and an All prices link', () => {
    h.d = { date: '2026-11-08', rows: ROWS, saved: false }
    const { container } = render(<PricesCard />)
    expect(screen.getByRole('heading', { name: 'Market prices' })).toBeTruthy()
    expect(container.querySelector('.dpc-label')!.textContent).toBe('Metro Manila prices (DA), Nov 8')
    expect(Array.from(container.querySelectorAll('.dpc-row')).map((x) => x.textContent)).toEqual(['Rice, regular milled₱52.00/kg', 'Galunggong₱260.00/kg', 'Pork liempo₱380.50/kg', 'Red onion₱250.00/kg'])
    expect(container.querySelector('.dpc-note')!.textContent).toBe('Local prices may differ.')
    expect(screen.getByRole('link', { name: 'All prices' }).getAttribute('href')).toBe('#garden/prices')
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('offline: the saved list shows with its own date and a Saved list chip', () => {
    h.d = { date: '2026-11-05', rows: ROWS, saved: true }
    const { container } = render(<PricesCard />)
    expect(screen.getByRole('status').textContent).toBe('Saved list')
    expect(container.querySelector('.dpc-label')!.textContent).toBe('Metro Manila prices (DA), Nov 5')
  })
})
