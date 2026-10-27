import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u', personId: 'me' }), onAuthChange: () => () => undefined }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ selfId: 'me', people: [{ id: 'me', name: 'Test Me', isMe: true }, { id: 'ma', name: 'Test Child', isMe: false }] }) }))
vi.mock('../health/useCanMark', () => ({ canMarkFor: () => true, useWritableIds: () => [] }))

import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { markTaken, useDueMeds } from './useDueMeds'

const soon = () => { const d = new Date(Date.now() + 30 * 60_000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

beforeEach(async () => { await Promise.all([ldb.medications.clear(), ldb.meds.clear(), hdb.people.clear()]) })

describe('useDueMeds', () => {
  it('a medicine for a person this phone no longer knows yields no due dose', async () => {
    const schedule = { v: 1, times: [soon()] }
    await ldb.medications.bulkAdd([
      { personId: 'me', name: 'Mine', medStatus: 'active', schedule, serverId: 's1' },
      { personId: 'ma', name: 'Theirs', medStatus: 'active', schedule, serverId: 's2' }
    ])
    const { result } = renderHook(() => useDueMeds())
    await waitFor(() => expect(result.current.due.map((d) => d.personId)).toEqual(['me']))
    await hdb.people.put({ id: 'ma', name: 'Test Child' })
    await waitFor(() => expect(result.current.due.map((d) => d.personId).sort()).toEqual(['ma', 'me']))
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
})
