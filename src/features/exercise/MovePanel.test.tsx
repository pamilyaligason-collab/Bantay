import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({ gateOk: false, conditions: [] as string[], latestBp: null as unknown, age: 70 as number | null }))
vi.mock('./data', () => ({ useMoveData: () => ({ personId: 'p1', acts: [], gateOk: data.gateOk, doctorOk: false, family: undefined, age: data.age, conditions: data.conditions, latestBp: data.latestBp, latestSugar: null }) }))
vi.mock('../safety/store', () => ({ putKv: async () => undefined }))

import MovePanel from './MovePanel'

afterEach(cleanup)

describe('MovePanel without the doctor OK (H15)', () => {
  it('the ring and a carousel of moves show; a move cannot be started, and the Doctor OK row says why', () => {
    data.gateOk = false
    render(<MovePanel />)
    expect(screen.getByRole('group', { name: 'This week' })).toBeTruthy()
    const row = screen.getByTestId('doctor-ok')
    expect(row.textContent).toContain('Not yet')
    expect(row.textContent).toContain('Check with your doctor before starting new exercise.')
    const moves = within(screen.getByTestId('move-carousel')).getAllByRole('button').filter((b) => !b.classList.contains('more-grid-btn'))
    expect(moves.length).toBeGreaterThan(2)
    expect(moves.length).toBeLessThanOrEqual(6)
    expect(moves.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(screen.queryByTestId('move-gate')).toBeNull()
  })
  it('R4 hideRing: no ring, the browse list stays', () => {
    data.gateOk = true
    render(<MovePanel hideRing />)
    expect(screen.queryByRole('group', { name: 'This week' })).toBeNull()
    expect(screen.getByRole('button', { name: /All moves/ })).toBeTruthy()
  })
  it('VR: on another person page (hideRing) Doctor OK and Todays plan are gone, the 911 line stays', () => {
    data.gateOk = false
    render(<MovePanel hideRing />)
    expect(screen.queryByTestId('doctor-ok')).toBeNull()
    expect(screen.queryByText("Today's plan")).toBeNull()
    expect(screen.queryByTestId('move-carousel')).toBeNull()
    expect(screen.getByTestId('move-911')).toBeTruthy()
  })
  it('the move detail view carries the same 911 line', () => {
    data.gateOk = true; data.conditions = []; data.latestBp = null
    render(<MovePanel />)
    fireEvent.click(within(screen.getByTestId('move-carousel')).getAllByRole('button')[0]!)
    expect(within(screen.getByTestId('move-detail')).getByTestId('move-911').textContent).toBe('Chest pain that does not stop: call 911.')
  })
  it('with the OK the row says Yes and the moves open', () => {
    data.gateOk = true
    render(<MovePanel />)
    expect(screen.getByTestId('doctor-ok').textContent).toContain('Yes')
    expect(within(screen.getByTestId('move-carousel')).getAllByRole('button')[0]!.getAttribute('aria-disabled')).toBeNull()
  })
  it('a person told to rest still sees the 911 line', () => {
    data.gateOk = true; data.conditions = ['hypertension']; data.latestBp = { sys: 190, dia: 110 }
    render(<MovePanel />)
    expect(screen.getByText(/Rest today/)).toBeTruthy()
    expect(screen.getByTestId('move-911').textContent).toBe('Chest pain that does not stop: call 911.')
    cleanup(); data.conditions = []; data.latestBp = null
  })
  it('another person page never shows the viewer rest advice, notes, gate or age-filtered moves, and nothing logs', () => {
    data.gateOk = false; data.conditions = ['hypertension', 'heart']; data.latestBp = { sys: 190, dia: 110 }; data.age = 90
    render(<MovePanel hideRing lockLog="Move logs are yours only. Tap Back to me to log." />)
    expect(screen.queryByText(/Rest today/)).toBeNull()
    expect(screen.queryByText(/My doctor said OK/)).toBeNull()
    expect(screen.queryByText(/Only walking and seated moves/)).toBeNull()
    expect(screen.getByTestId('move-911')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /All moves/ }))
    const cards = within(screen.getByRole('list', { name: 'Browse moves' })).getAllByRole('button')
    expect(cards.every((b) => b.getAttribute('aria-disabled') !== 'true')).toBe(true) // not locked on the viewer's gate
    fireEvent.click(cards[0]!)
    expect(screen.getByText('Move logs are yours only. Tap Back to me to log.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true)
    data.conditions = []; data.latestBp = null; data.age = 70
  })
})
