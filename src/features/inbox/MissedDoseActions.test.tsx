import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Medication } from '../log/store'
import { doseRef, MissedDoseActions } from './MissedDoseActions'

const h = vi.hoisted(() => ({ phone: '+639171234567' as string | null, takes: [] as unknown[], logDose: vi.fn(), can: null as { log: boolean; reason: string | null } | null }))
const MED: Medication = { personId: 'p1', name: 'Losartan', serverId: 'm1', medStatus: 'active', schedule: { v: 1, times: ['09:00'] } }
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [{ id: 'p1', name: 'Mama Rosa', phone: h.phone, isMe: false }], selfId: 'me' }) }))
vi.mock('../health/useMedications', () => ({ useMedications: (id: string) => (id === 'p1' ? [MED] : []) }))
vi.mock('../health/useActivity', () => ({ useTakenToday: () => h.takes }))
vi.mock('../viewas/viewAs', () => ({ useActingCan: () => h.can }))
vi.mock('../log/store', () => ({ logDose: (...a: unknown[]) => h.logDose(...a) }))
afterEach(() => { cleanup(); h.phone = '+639171234567'; h.can = null; h.takes = []; h.logDose.mockReset() })

const NOW = new Date(2026, 9, 26, 10, 10)
const REF = 'm1:2026-10-26:09:00'

describe('doseRef', () => {
  it('reads the day and slot out of the ref, and gives null parts when there is none', () => {
    expect(doseRef(REF)).toEqual({ day: '2026-10-26', slot: '09:00' })
    expect(doseRef('2026-10-26')).toEqual({ day: '2026-10-26', slot: null })
    expect(doseRef('abc')).toEqual({ day: null, slot: null })
    expect(doseRef(null)).toEqual({ day: null, slot: null })
  })
})

describe('MissedDoseActions (lock-missed)', () => {
  it('Call opens the phone app with her number; Message the family goes to the Family tab', () => {
    render(<MissedDoseActions personId="p1" refText={REF} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Call Mama Rosa' }).getAttribute('href')).toBe('tel:+639171234567')
    expect(screen.getByRole('link', { name: 'Message the family' }).getAttribute('href')).toBe('#family/messages')
  })
  it('no phone number: no tel link, a link to her page instead (never a blank number)', () => {
    h.phone = null
    render(<MissedDoseActions personId="p1" refText={REF} now={NOW} />)
    expect(screen.queryByRole('link', { name: /^Call/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open Mama Rosa' }).getAttribute('href')).toBe('#family/people/p1')
  })
  it('Mark taken asks "Did you see her take it?" first; Not sure logs nothing; Yes logs that slot once', async () => {
    render(<MissedDoseActions personId="p1" refText={REF} now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark taken for Mama Rosa' }))
    expect(screen.getByText('Did you see Mama Rosa take it?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not sure' }))
    expect(h.logDose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mark taken for Mama Rosa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I saw' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Marked as taken'))
    expect(h.logDose).toHaveBeenCalledTimes(1)
    expect(h.logDose).toHaveBeenCalledWith(MED, '09:00')
  })
  it('S16: acting for a member the admin cannot log for, Mark taken is disabled with a lock and "View only", and nothing is logged', () => {
    h.can = { log: false, reason: 'You can see her but not log for her.' }
    render(<MissedDoseActions personId="p1" refText={REF} now={NOW} />)
    const b = screen.getByRole('button', { name: /Mark taken for Mama Rosa/ }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.textContent).toContain('View only')
    fireEvent.click(b)
    expect(screen.queryByText('Did you see Mama Rosa take it?')).toBeNull()
    expect(h.logDose).not.toHaveBeenCalled()
  })
  it('S16: acting with log access keeps the normal button', () => {
    h.can = { log: true, reason: null }
    render(<MissedDoseActions personId="p1" refText={REF} now={NOW} />)
    expect((screen.getByRole('button', { name: 'Mark taken for Mama Rosa' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('no Mark taken when the slot is already taken, is not today, or the ref has no slot', () => {
    h.takes = [{ name: 'Losartan', takenAt: new Date(2026, 9, 26, 9, 40).toISOString(), medicationId: 'm1', slot: '09:00' }]
    const a = render(<MissedDoseActions personId="p1" refText={REF} now={NOW} />)
    expect(screen.queryByRole('button', { name: /Mark taken/ })).toBeNull()
    a.unmount(); h.takes = []
    const b = render(<MissedDoseActions personId="p1" refText="m1:2026-10-25:09:00" now={NOW} />)
    expect(screen.queryByRole('button', { name: /Mark taken/ })).toBeNull()
    b.unmount()
    render(<MissedDoseActions personId="p1" refText="m1" now={NOW} />)
    expect(screen.queryByRole('button', { name: /Mark taken/ })).toBeNull()
  })
})
