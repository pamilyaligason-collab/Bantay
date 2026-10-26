import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ markDue: vi.fn(async () => true) }))
vi.mock('./useDueMeds', () => ({ markDue: h.markDue }))
import NextUp from './NextUp'
import { pickNext, type DuePerson } from './nextPick'

afterEach(() => { cleanup(); h.markDue.mockClear() })
const now = new Date(2026, 9, 19, 9)
const ma: DuePerson = { personId: 'ma', name: 'Ma', isMe: false, at: 480, rel: 480, status: 'missed', slots: [{ name: 'Aspirin', slot: '08:00', at: 480, medicationId: 'm1', key: 'm1', personId: 'ma', dose: '1 tablet' }] }
const dose = (d = ma) => pickNext({ due: [d], plan: null, storm: null }, now)
const run = (item = dose(), review = 0, notify = () => undefined) => render(<NextUp item={item} review={review} notify={notify} />)

describe('NextUp', () => {
  it('keeps a hidden "Next up" heading; the card kicker says it, with the when line under the title', () => {
    run()
    expect(screen.getByRole('heading', { level: 2, name: 'Next up' }).className).toBe('td-vh')
    expect(screen.getByText('Late · not taken yet')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Ma: Aspirin' })).toBeTruthy()
    expect(screen.getByText('8:00 AM · 1 h ago · 1 tablet')).toBeTruthy()
  })
  it('no medicines to check: no panel', () => {
    run()
    expect(screen.queryByRole('link', { name: /to check/ })).toBeNull()
  })
  it('Skip is hidden for a medicine with no server id (it could never be matched)', () => {
    run(dose({ ...ma, slots: [{ ...ma.slots[0]!, medicationId: null }] }))
    expect(screen.getByRole('button', { name: 'Taken' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })
  it('a cared-for person dose: Taken and Skip log through markDue; the panel counts medicines to check', async () => {
    const notify = vi.fn()
    run(dose(), 2, notify)
    expect(screen.getByRole('link', { name: /2 medicines to check/ }).getAttribute('href')).toBe('#health/meds')
    fireEvent.click(screen.getByRole('button', { name: 'Taken' }))
    await waitFor(() => expect(h.markDue).toHaveBeenCalledWith(ma, false))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Marked Aspirin taken'))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(h.markDue).toHaveBeenLastCalledWith(ma, true))
  })
  it('a plan item links to the plan', () => {
    run(pickNext({ due: [], plan: { key: 'p', kind: 'plan', kicker: 'Plan · today', title: 'Next: Pay bills', body: 'Due today', actions: [] }, storm: null }))
    expect(screen.getByRole('link', { name: 'Open plan' }).getAttribute('href')).toBe('#family/plan')
  })
})
