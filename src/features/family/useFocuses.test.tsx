import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./roster', async (orig) => ({ ...(await orig<typeof import('./roster')>()), useCheckInsLoaded: () => ({}) }))
const al = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('../notify/useAlerts', () => ({ useAlertRows: () => al.rows }))
vi.mock('./CarerCards', async (orig) => ({ ...(await orig<typeof import('./CarerCards')>()), useCarerIds: () => [] }))
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<typeof import('../viewas/viewAs')>()), useActing: () => ({ acting: false }) }))
import { useFocuses } from './useFocuses'
import { ldb } from '../log/store'

const person = (id: string, name: string) => ({ id, name, isMe: false, phone: null, birthdate: null, photoPath: null, thumb: null }) as never
const day = new Date(2026, 9, 27, 14, 0)

describe('useFocuses', () => {
  beforeEach(async () => { vi.useFakeTimers({ toFake: ['Date'], now: day }); await Promise.all([ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear()]) })
  afterEach(() => { vi.useRealTimers(); al.rows = [] })
  it('D-109: no take rows and no write link still reads Missed, read-only; there is no No data state', async () => {
    await ldb.medications.add({ personId: 'mama', name: 'Losartan', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId: 'm1' } as never)
    const { result } = renderHook(() => useFocuses([person('mama', 'Mama')]))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const it = result.current.items[0]!
    expect(it.focus.kind).toBe('missed')
    expect(it.missedDoses).toHaveLength(1)
    expect(it.focus.action?.kind).toBe('open') // read-only: no Mark taken
  })
  it("Lola's losartan take does not clear Lolo's missed losartan", async () => {
    const med = (personId: string, serverId: string) => ({ personId, name: 'Losartan', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId }) as never
    await ldb.medications.bulkAdd([med('lolo', 'm1'), med('lola', 'm2')])
    await ldb.meds.add({ personId: 'lola', name: 'Losartan', takenAt: new Date(2026, 9, 27, 8, 5).toISOString() } as never) // an old row: no medicationId
    await ldb.meds.add({ personId: 'lolo', name: 'Vitamin C', takenAt: new Date(2026, 9, 26, 8, 5).toISOString() } as never) // Lolo's takes sync, so a dose with no mark is a real miss
    const { result } = renderHook(() => useFocuses([person('lolo', 'Lolo'), person('lola', 'Lola')]))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const of = (id: string) => result.current.items.find((i) => i.person.id === id)!
    expect(of('lolo').missedDoses).toHaveLength(1)
    expect(of('lola').missedDoses).toHaveLength(0)
  })
})
