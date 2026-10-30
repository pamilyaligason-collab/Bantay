import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ markDue: vi.fn(async () => true), markTaken: vi.fn(async (_p: string, ids: string[]) => ids.length) }))
vi.mock('./useDueMeds', () => ({ markDue: h.markDue, markTaken: h.markTaken }))
import NextUp from './NextUp'
import { pickNext, type DuePerson } from './nextPick'

afterEach(() => { cleanup(); h.markDue.mockClear(); h.markTaken.mockClear() })
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
    expect(screen.getByRole('button', { name: 'Mark as taken' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })
  it('a cared-for person dose: Taken and Skip log through markDue; the panel counts medicines to check', async () => {
    const notify = vi.fn()
    run(dose(), 2, notify)
    expect(screen.getByRole('link', { name: /2 medicines to check/ }).getAttribute('href')).toBe('#health/meds')
    fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
    await waitFor(() => expect(h.markDue).toHaveBeenCalledWith(ma, false))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Marked Aspirin taken'))
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull() // after Taken the card is on its way out
    cleanup()
    run(dose(), 2, notify)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(h.markDue).toHaveBeenLastCalledWith(ma, true))
  })
  it('2 medicines due together: Taken opens a checklist, all ticked; unticking one logs 1 row (markTaken with 1 id)', async () => {
    const two: DuePerson = { ...ma, slots: [ma.slots[0]!, { name: 'Metformin (Glucophage)', slot: '08:00', at: 480, medicationId: 'm2', key: 'm2', personId: 'ma', dose: null }] }
    const notify = vi.fn()
    run(dose(two), 0, notify)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
    expect(h.markTaken).not.toHaveBeenCalled() // nothing is logged by the first tap
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map((b) => b.checked)).toEqual([true, true])
    expect(screen.getByText('Metformin')).toBeTruthy() // the short name
    fireEvent.click(boxes[0]!) // untick Aspirin
    fireEvent.click(screen.getByRole('button', { name: 'Mark these taken' }))
    await waitFor(() => expect(h.markTaken).toHaveBeenCalledWith('ma', ['m2']))
    expect(h.markDue).not.toHaveBeenCalled()
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Marked Metformin taken'))
  })
  it('2 medicines, everything unticked: the button is off (never logs nothing as success)', () => {
    const two: DuePerson = { ...ma, slots: [ma.slots[0]!, { ...ma.slots[0]!, name: 'Metformin', medicationId: 'm2', key: 'm2' }] }
    run(dose(two))
    fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
    for (const b of screen.getAllByRole('checkbox')) fireEvent.click(b)
    expect((screen.getByRole('button', { name: 'Mark these taken' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('done-morph: the card is held while the write runs; only after it succeeds does the button read "Taken h:mm", then the card collapses and is freed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const hold = vi.fn()
      render(<NextUp item={dose()} review={0} notify={() => undefined} hold={hold} />)
      fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
      expect(hold).toHaveBeenCalledWith(dose()) // frozen before the write, not animated
      await waitFor(() => expect(screen.getByRole('button', { name: /^Taken \d{1,2}:\d{2}/ })).toBeTruthy())
      expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
      expect(document.querySelector('.td-next.leaving')).toBeNull()
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(document.querySelector('.td-next.leaving')).not.toBeNull()
      expect(hold).not.toHaveBeenCalledWith(null)
      await act(async () => { await vi.advanceTimersByTimeAsync(240) })
      expect(hold).toHaveBeenLastCalledWith(null)
    } finally { vi.useRealTimers() }
  })
  it('done-morph: a failed write never morphs and frees the card at once', async () => {
    h.markDue.mockResolvedValueOnce(false)
    const hold = vi.fn()
    const notify = vi.fn()
    render(<NextUp item={dose()} review={0} notify={notify} hold={hold} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
    await waitFor(() => expect(hold).toHaveBeenLastCalledWith(null))
    expect(screen.getByRole('button', { name: 'Mark as taken' })).toBeTruthy()
    expect(document.querySelector('.td-taken.done')).toBeNull()
  })
  it('a plan item links to the plan', () => {
    run(pickNext({ due: [], plan: { key: 'p', kind: 'plan', kicker: 'Plan · today', title: 'Next: Pay bills', body: 'Due today', actions: [] }, storm: null }))
    expect(screen.getByRole('link', { name: 'Open plan' }).getAttribute('href')).toBe('#family/plan')
  })
})

describe('NextUp unmounted early', () => {
  it('frees the held card (SOS or Simple mode replaces Today within the morph)', () => {
    const hold = vi.fn()
    const { unmount } = render(<NextUp item={dose()} review={0} notify={() => undefined} hold={hold} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
    expect(hold).toHaveBeenCalledWith(dose())
    unmount()
    expect(hold).toHaveBeenLastCalledWith(null)
  })
})
