import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u', personId: 'me' }), onAuthChange: () => () => undefined }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ selfId: 'me', people: [{ id: 'me', name: 'Test Me', isMe: true }, { id: 'ma', name: 'Test Child', isMe: false }] }) }))
vi.mock('../health/useCanMark', () => ({ canMarkFor: () => true, useWritableIds: () => [] }))

import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { useDueMeds } from './useDueMeds'

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
})
