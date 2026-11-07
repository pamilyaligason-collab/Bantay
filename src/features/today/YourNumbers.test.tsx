import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('dexie', () => ({ liveQuery: () => ({ subscribe: (o: { next: (v: unknown[]) => void }) => { o.next([]); return { unsubscribe: () => undefined } } }) }))
vi.mock('../records/store', () => ({ hdb: { readings: { where: () => ({ equals: () => ({ toArray: () => [] }) }) }, thresholds: { toArray: () => [] } } }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => 'me' }))
vi.mock('../health/useActivity', () => ({ useActivity: () => [] }))
vi.mock('./numbers', () => ({
  pickExtraTile: () => ({ kicker: 'Weight', tint: 'purple', value: '61 kg', sub: 'As of 1 Nov', action: 'Readings', href: '#health/metric/weight', points: [60, 61, 61.5] }),
  numberTiles: () => ['Blood pressure', 'Sugar', 'Cholesterol', 'Uric acid', 'Creatinine'].map((kicker) => ({ kicker, tint: 'blue', value: '1', sub: 'Sample', action: 'Readings', href: '#health' }))
}))
import YourNumbers from './YourNumbers'
afterEach(cleanup)

describe('Your numbers', () => {
  it('shows every card at once in a 2-column grid, no swipe row', () => {
    render(<YourNumbers />)
    const grid = screen.getByRole('group', { name: 'Your numbers' })
    expect(grid.className).toBe('pt-grid')
    expect(grid.querySelectorAll('.pt').length).toBe(6)
    for (const k of ['Blood pressure', 'Sugar', 'Cholesterol', 'Uric acid', 'Creatinine', 'Weight']) expect(screen.getByText(k)).toBeTruthy()
    expect(document.querySelector('.carousel')).toBeNull()
    expect(grid.querySelector('.pt-spark')?.getAttribute('aria-hidden')).toBe('true') // value stays visible text
  })
})
