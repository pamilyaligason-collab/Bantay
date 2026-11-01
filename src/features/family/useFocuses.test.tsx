import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./roster', async (orig) => ({ ...(await orig<typeof import('./roster')>()), useCheckInsLoaded: () => ({}) }))
vi.mock('../notify/useAlerts', () => ({ useAlertRows: () => [] }))
vi.mock('./CarerCards', async (orig) => ({ ...(await orig<typeof import('./CarerCards')>()), useCarerIds: () => [] }))
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<typeof import('../viewas/viewAs')>()), useActing: () => ({ acting: false }) }))
import { useFocuses } from './useFocuses'
import { ldb } from '../log/store'

const person = (id: string, name: string) => ({ id, name, isMe: false, phone: null, birthdate: null, photoPath: null, thumb: null }) as never
const day = new Date(2026, 9, 27, 14, 0)

describe('useFocuses', () => {
  beforeEach(async () => { vi.useFakeTimers({ toFake: ['Date'], now: day }); await Promise.all([ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear()]) })
  afterEach(() => vi.useRealTimers())
  it("Lola's losartan take does not clear Lolo's missed losartan", async () => {
    const med = (personId: string, serverId: string) => ({ personId, name: 'Losartan', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId }) as never
    await ldb.medications.bulkAdd([med('lolo', 'm1'), med('lola', 'm2')])
    await ldb.meds.add({ personId: 'lola', name: 'Losartan', takenAt: new Date(2026, 9, 27, 8, 5).toISOString() } as never) // an old row: no medicationId
    const { result } = renderHook(() => useFocuses([person('lolo', 'Lolo'), person('lola', 'Lola')]))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const of = (id: string) => result.current.items.find((i) => i.person.id === id)!
    expect(of('lolo').missedDoses).toHaveLength(1)
    expect(of('lola').missedDoses).toHaveLength(0)
  })
})
