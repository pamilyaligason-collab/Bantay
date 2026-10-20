import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ review: 0, due: [] as unknown[], markDue: vi.fn(async () => true) }))
vi.mock('../location/useLocation', () => ({ usePlace: () => null }))
vi.mock('../safety/store', () => ({ useKv: () => [] }))
vi.mock('./planCard', () => ({ usePlanCard: () => null }))
vi.mock('./useDueMeds', () => ({ useDueMeds: () => ({ due: h.due, review: h.review, tick: new Date(2026, 9, 19, 9) }), markDue: h.markDue }))
import NextUp from './NextUp'

afterEach(() => { cleanup(); h.markDue.mockClear() })
const ma = { personId: 'ma', name: 'Ma', isMe: false, at: 480, status: 'missed', slots: [{ name: 'Aspirin', slot: '08:00', at: 480, medicationId: 'm1', key: 'm1', personId: 'ma', dose: null }] }

describe('NextUp', () => {
  it('calm when nothing is due, no footer without reviews', () => {
    h.due = []; h.review = 0
    render(<NextUp notify={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'All clear' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /to check/ })).toBeNull()
  })
  it('Skip is hidden for a medicine with no server id (it could never be matched)', () => {
    h.due = [{ ...ma, slots: [{ ...ma.slots[0]!, medicationId: null }] }]; h.review = 0
    render(<NextUp notify={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Taken' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })
  it('a cared-for person dose: Taken and Skip log through markDue; footer counts medicines to check', async () => {
    h.due = [ma]; h.review = 2
    const notify = vi.fn()
    render(<NextUp notify={notify} />)
    expect(screen.getByRole('heading', { name: 'Ma: Aspirin' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /2 medicines to check/ }).getAttribute('href')).toBe('#health/meds')
    fireEvent.click(screen.getByRole('button', { name: 'Taken' }))
    await waitFor(() => expect(h.markDue).toHaveBeenCalledWith(ma, false))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Marked Aspirin taken'))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(h.markDue).toHaveBeenLastCalledWith(ma, true))
  })
})
