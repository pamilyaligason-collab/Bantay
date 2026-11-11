import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/client', () => ({ supabase: null }))

import { adb, unseenCount, type AlertRow } from '../notify/store'
import { readArchive, ARCHIVE_KEY } from '../notify/archive'
import { readAndArchiveFamily } from './useInbox'

const NOW = Date.now()
const row = (id: string, kind: AlertRow['kind'], ageH: number, seenAt: string | null = null): AlertRow => ({
  id, personId: 'p1', kind, template: 'dose_missed' as AlertRow['template'], ref: id,
  createdAt: new Date(NOW - ageH * 3_600_000).toISOString(), pushedAt: null, seenAt, expiresAt: new Date(NOW + 5 * 86_400_000).toISOString()
})

beforeEach(async () => { await adb.alerts.clear(); localStorage.removeItem(ARCHIVE_KEY) })

describe('bell Mark all read archives everything up to now', () => {
  it('marks every visible row seen and files all but the SOS in the archive; nothing is deleted', async () => {
    const rows = [row('a', 'dose_missed', 30), row('b', 'hazard', 2), row('c', 'sos', 1), row('d', 'digest', 50, new Date(NOW - 3_600_000).toISOString())]
    await adb.alerts.bulkPut(rows)
    expect(await unseenCount()).toBe(3)
    await readAndArchiveFamily(rows)
    expect(await unseenCount()).toBe(0) // the badge goes to zero, the SOS included (read, not archived)
    expect(await adb.alerts.count()).toBe(4) // no delete
    expect(readArchive().map((a) => a.row.id).sort()).toEqual(['a', 'b', 'd'])
  })
  it('a second run leaves nothing unseen', async () => {
    const rows = [row('a', 'dose_missed', 30)]
    await adb.alerts.bulkPut(rows)
    await readAndArchiveFamily(rows)
    await readAndArchiveFamily([])
    expect(await unseenCount()).toBe(0)
  })
})
