import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ markDue: vi.fn(async () => true), snooze: vi.fn(async () => 'snoozed') }))
vi.mock('./useDueMeds', () => ({ markDue: h.markDue, markTaken: vi.fn(async () => 1) }))
vi.mock('../health/reminderActions', async (orig) => ({ ...(await orig<typeof import('../health/reminderActions')>()), handleReminderAction: h.snooze }))
vi.mock('./MyWeek', () => ({ default: () => <div data-testid="myweek" /> }))
import NextUp, { SNOOZE_MIN } from './NextUp'
import { SNOOZE_MIN as NATIVE_SNOOZE_MIN } from '../health/reminderActions'
import SeeWeek from './SeeWeek'
import { isNight } from './SimpleToday'
import { isSnoozed } from './snoozeCard'
import { pickNext, type DuePerson } from './nextPick'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); h.markDue.mockClear(); h.snooze.mockClear() })
const now = new Date(2026, 9, 19, 9)
const person = (status: 'missed' | 'upcoming'): DuePerson => ({ personId: 'me', name: 'Lloyd', isMe: true, at: 540, rel: 540, status, slots: [{ name: 'Losartan 50 mg', slot: '09:00', at: 540, medicationId: 'm1', key: 'm1', personId: 'me', dose: '1 tablet' }] })
const run = (status: 'missed' | 'upcoming') => render(<NextUp item={pickNext({ due: [person(status)], plan: null, storm: null }, now)} review={0} notify={() => undefined} />)

describe('Today v7: In 10 min on the late dose card', () => {
  it('a late card has In 10 min; click snoozes this slot for 10 minutes and rings the native snooze once', async () => {
    run('missed')
    fireEvent.click(screen.getByRole('button', { name: 'In 10 minutes' }))
    expect(isSnoozed('dose:me:540', new Date(Date.now() + 9 * 60_000))).toBe(true)
    expect(isSnoozed('dose:me:540', new Date(Date.now() + 11 * 60_000))).toBe(false)
    await waitFor(() => expect(h.snooze).toHaveBeenCalledTimes(1))
    const ev = (h.snooze.mock.calls[0] as unknown as [{ actionId: string; notification: { extra: { kind: string; at: number; people: string[] } } }])[0]
    expect(ev.actionId).toBe('snooze')
    expect(ev.notification.extra).toMatchObject({ kind: 'dose', at: 540, people: ['me'] })
    expect(h.markDue).not.toHaveBeenCalled() // snooze never logs the dose
  })
  it('an upcoming card has Snooze too (S16: Take, Snooze, Skip)', () => {
    run('upcoming')
    expect(screen.getByRole('button', { name: 'In 10 minutes' })).toBeTruthy()
  })
  it('after Taken the card says Saved and shows Jack well-done, decorative', async () => {
    const { container } = run('missed')
    fireEvent.click(screen.getByRole('button', { name: 'Mark as taken' }))
    await screen.findByText(/Saved\. This card folds away/)
    expect(container.querySelector('img.jack')?.getAttribute('alt')).toBe('')
    expect(screen.queryByRole('button', { name: 'In 10 minutes' })).toBeNull()
  })
})

it('the card snooze and the lock-screen snooze are the same minutes', () => expect(SNOOZE_MIN).toBe(NATIVE_SNOOZE_MIN))

describe('See the week', () => {
  it('My week is not drawn until the link is opened, and closes again', () => {
    render(<SeeWeek />)
    expect(screen.queryByTestId('myweek')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /See the week/ }))
    expect(screen.getByTestId('myweek')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Hide the week/ }))
    expect(screen.queryByTestId('myweek')).toBeNull()
  })
})

describe('Simple mode night', () => {
  it('night is 9 PM to before 5 AM', () => {
    const at = (hh: number, m = 0) => new Date(2026, 9, 28, hh, m)
    expect([isNight(at(20, 59)), isNight(at(21)), isNight(at(23, 30)), isNight(at(0, 30)), isNight(at(4, 59)), isNight(at(5))]).toEqual([false, true, true, true, true, false])
  })
})
