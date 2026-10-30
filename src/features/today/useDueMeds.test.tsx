import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u', personId: 'me' }), onAuthChange: () => () => undefined }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ selfId: 'me', people: [{ id: 'me', name: 'Test Me', isMe: true }, { id: 'ma', name: 'Test Child', isMe: false }] }) }))
vi.mock('../health/useCanMark', () => ({ canMarkFor: () => true, useWritableIds: () => [] }))

import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { markDue, markTaken, useDueMeds } from './useDueMeds'
import { setActing } from '../viewas/store'

const soon = () => { const d = new Date(Date.now() + 30 * 60_000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

beforeEach(async () => { await Promise.all([ldb.medications.clear(), ldb.meds.clear(), hdb.people.clear()]) })

describe('useDueMeds', () => {
  it('N-3: Next up shows only my own doses, even for a known person I can mark for', async () => {
    const schedule = { v: 1, times: [soon()] }
    await ldb.medications.bulkAdd([
      { personId: 'me', name: 'Mine', medStatus: 'active', schedule, serverId: 's1' },
      { personId: 'ma', name: 'Theirs', medStatus: 'active', schedule, serverId: 's2' }
    ])
    const { result } = renderHook(() => useDueMeds())
    await waitFor(() => expect(result.current.due.map((d) => d.personId)).toEqual(['me']))
    await hdb.people.put({ id: 'ma', name: 'Test Child' })
    await new Promise((r) => setTimeout(r, 50)) // the live query has seen the new person
    expect(result.current.due.map((d) => d.personId)).toEqual(['me'])
  })
  it('markTaken logs only the chosen medicines among the doses due now', async () => {
    const schedule = { v: 1, times: [soon()] }
    await ldb.medications.bulkAdd([
      { personId: 'me', name: 'Aspirin', medStatus: 'active', schedule, serverId: 's1' },
      { personId: 'me', name: 'Losartan', medStatus: 'active', schedule, serverId: 's2' }
    ])
    expect(await markTaken('me', [])).toBe(0)
    expect(await markTaken('me', ['s2'])).toBe(1)
    const rows = await ldb.meds.toArray()
    expect(rows.map((r) => [r.name, r.medicationId, r.personId])).toEqual([['Losartan', 's2', 'me']])
    expect(await markTaken('me', ['s2'])).toBe(0) // already taken: no double row
    expect(await ldb.meds.count()).toBe(1)
  })
  it('a dose just after midnight tapped before midnight is logged once, not twice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 23, 50)) // 23:50 local; the dose is 00:20 tomorrow
    try {
      await ldb.medications.bulkAdd([{ personId: 'me', name: 'Losartan', medStatus: 'active', schedule: { v: 1, times: ['00:20'] }, serverId: 's9' }])
      expect(await markTaken('me', ['s9'])).toBe(1)
      expect(await markTaken('me', ['s9'])).toBe(0)
      expect(await ldb.meds.count()).toBe(1)
    } finally { vi.useRealTimers() }
  })
  it('a medicine not synced yet (no server id) is also guarded, and a second unsynced medicine in the same slot is not blocked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 23, 50))
    try {
      await ldb.medications.bulkAdd([
        { personId: 'me', name: 'Unsynced A', medStatus: 'active', schedule: { v: 1, times: ['00:20'] } },
        { personId: 'me', name: 'Unsynced B', medStatus: 'active', schedule: { v: 1, times: ['00:20'] } }
      ])
      const keys = async () => (await import('./nextPick')).nextDoses([{ personId: 'me', name: '', isMe: true }], await ldb.medications.toArray(), await ldb.meds.toArray(), new Date())[0]!.slots.map((x) => x.key)
      const [a, b] = await keys()
      expect(await markTaken('me', [a!])).toBe(1)
      expect(await markTaken('me', [a!])).toBe(0) // same unsynced medicine again: no second row
      expect(await markTaken('me', [b!])).toBe(1) // a different unsynced medicine in the same slot still logs
      expect((await ldb.meds.toArray()).map((r) => r.name).sort()).toEqual(['Unsynced A', 'Unsynced B'])
    } finally { vi.useRealTimers() }
  })
  it('S16 L6: while acting the targets are the acting member (even without edit access), at 23:30 and 00:30 local; exit returns to me', async () => {
    for (const [now, dose] of [[new Date(2026, 9, 30, 23, 30), '23:50'], [new Date(2026, 9, 31, 0, 30), '00:50']] as const) {
      await ldb.medications.clear()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(now)
      try {
        const schedule = { v: 1, times: [dose] }
        await ldb.medications.bulkAdd([{ personId: 'me', name: 'Mine', medStatus: 'active', schedule, serverId: 's1' }, { personId: 'ma', name: 'Hers', medStatus: 'active', schedule, serverId: 's2' }])
        setActing({ personId: 'ma', name: 'Child', can: { log: false, edit: true, rollcall: false, mood: false, reason: 'x' } })
        const { result, unmount } = renderHook(() => useDueMeds())
        await waitFor(() => expect(result.current.due.map((d) => d.personId)).toEqual(['ma']))
        setActing(null)
        await waitFor(() => expect(result.current.due.map((d) => d.personId)).toEqual(['me']))
        unmount()
      } finally { setActing(null); vi.useRealTimers() }
    }
  })
  it('S16 L6: markDue for the acting member logs nothing without log access (no local dose the server would refuse), and logs for her with it', async () => {
    const d = { personId: 'ma', name: 'Child', isMe: false, slots: [{ key: 'k', name: 'Hers', slot: '08:00', medicationId: 's2' }] } as unknown as Parameters<typeof markDue>[0]
    await ldb.meds.clear()
    setActing({ personId: 'ma', name: 'Child', can: { log: false, edit: true, rollcall: false, mood: false, reason: 'x' } })
    try {
      expect(await markDue(d)).toBe(false)
      expect(await ldb.meds.count()).toBe(0)
      setActing({ personId: 'ma', name: 'Child', can: { log: true, edit: true, rollcall: true, mood: true, reason: null } })
      expect(await markDue(d)).toBe(true)
      expect((await ldb.meds.toArray()).map((r) => r.personId)).toEqual(['ma'])
    } finally { setActing(null) }
  })
})
