import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'
import { aboutFields, aboutOf, applyPulledProfiles, blankProfile, fromServer, mergeProfile, migrateKv, saveProfile } from './profile'
import { resetSyncForTests, startSync, syncNow } from './sync'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const URL = 'https://x.supabase.test'
const server = (o: Record<string, unknown> = {}) => fromServer({ id: 'me', updated_at: '2026-10-10T10:00:00Z', ...o })

beforeEach(async () => {
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.profiles.clear(), hdb.people.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('mergeProfile (server newer wins)', () => {
  it('takes the server row when there is nothing local or nothing pending', () => {
    const s = server({ phone: '0917 111 2222' })
    expect(mergeProfile(undefined, s)).toBe(s)
    expect(mergeProfile({ ...blankProfile('me'), updatedAt: '2026-10-11T00:00:00Z' }, s)).toBe(s)
  })
  it('keeps an unconfirmed local edit while it is newer than the server row', () => {
    const local = { ...blankProfile('me'), phone: '0999 000 0000', updatedAt: '2026-10-12T00:00:00Z', pending: ['phone' as const] }
    const m = mergeProfile(local, server({ phone: '0917 111 2222', blood_type: 'O+' }))
    expect(m.phone).toBe('0999 000 0000') // ours
    expect(m.bloodType).toBe('O+') // server's, we never touched it
    expect(m.pending).toEqual(['phone'])
  })
  it('server wins when it is newer than our pending edit', () => {
    const local = { ...blankProfile('me'), phone: '0999 000 0000', updatedAt: '2026-10-01T00:00:00Z', pending: ['phone' as const] }
    const s = server({ phone: '0917 111 2222' })
    expect(mergeProfile(local, s)).toBe(s)
  })
  it('unknown stays null, arrays default empty', () => {
    const s = fromServer({ id: 'x', phone: '', blood_type: null, allergies: null })
    expect(s.phone).toBeNull()
    expect(s.bloodType).toBeNull()
    expect(s.allergies).toEqual([])
  })
  it('applyPulledProfiles stores rows and refreshes the kv cache for self only', async () => {
    await applyPulledProfiles([
      { id: 'me', updated_at: '2026-10-10T10:00:00Z', blood_type: 'A+', allergies: ['Penicillin'], conditions: [], medicines: ['Losartan'], photo_path: 'me.jpg' },
      { id: 'other', updated_at: '2026-10-10T10:00:00Z', medicines: ['Metformin'] }
    ], 'me')
    expect((await db.profiles.get('other'))?.medicines).toEqual(['Metformin'])
    expect((await db.kv.get('profile.about'))?.value).toEqual({ bloodType: 'A+', allergies: 'Penicillin' })
    expect((await db.kv.get('profile.medicines'))?.value).toEqual(['Losartan'])
    expect((await db.kv.get('profile.photoPath'))?.value).toBe('me.jpg')
  })
  it('an old-select row (no profile columns) is ignored', async () => {
    await applyPulledProfiles([{ id: 'me', display_name: 'Mama' }], 'me')
    expect(await db.profiles.count()).toBe(0)
  })
})

describe('about mapping', () => {
  it('round-trips the wizard shape, including UNKNOWN', () => {
    const a = { bloodType: 'UNKNOWN', allergies: 'Penicillin, Latex', conditions: 'UNKNOWN' }
    const f = aboutFields(a)
    expect(f).toEqual({ bloodType: 'UNKNOWN', allergies: ['Penicillin', 'Latex'], conditions: ['UNKNOWN'] })
    expect(aboutOf({ ...blankProfile('x'), ...f })).toEqual(a)
  })
})

describe('outbox update', () => {
  it('saveProfile writes locally and queues one people_profile update', async () => {
    const r = await saveProfile('me', { phone: '0917 123 4567', allergies: ['None'] })
    expect(r.pending).toEqual(['phone', 'allergies'])
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'people_profile', op: 'update', payload: { id: 'me', phone: '0917 123 4567', allergies: ['None'] } })
    expect((await db.kv.get('profile.about'))?.value).toEqual({ allergies: 'None' })
  })
  it('sync sends it as a PATCH of that person row, then the server row replaces the pending marker', async () => {
    await saveProfile('me', { phone: '0917 123 4567' })
    const calls: { url: string; method: string; body?: string }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined })
      if (init.method === 'PATCH') return new Response(null, { status: 204 })
      if (url.includes('/people?')) return new Response(JSON.stringify([{ id: 'me', display_name: 'Mama', updated_at: '2999-01-01T00:00:00Z', phone: '0917 123 4567', allergies: [], conditions: [], medicines: [] }]), { status: 200 })
      return new Response('[]', { status: 200 })
    })
    startSync({ url: URL, key: 'pk', getToken: async () => 'tok1' })()
    await syncNow()
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe(`${URL}/rest/v1/people?id=eq.me`)
    const body = JSON.parse(patch.body!)
    expect(body.phone).toBe('0917 123 4567')
    expect(body.id).toBeUndefined()
    expect(typeof body.updated_at).toBe('string')
    expect(await db.outbox.count()).toBe(0)
    expect((await db.profiles.get('me'))?.pending).toBeUndefined()
  })
})

describe('one-time kv migration', () => {
  it('copies wizard answers up once, only into fields the server left empty', async () => {
    await db.kv.put({ key: 'profile.about', value: { bloodType: 'B+', allergies: 'Latex', conditions: 'UNKNOWN' } })
    await db.kv.put({ key: 'profile.medicines', value: ['Losartan'] })
    await db.kv.put({ key: 'profile.photo', value: 'data:image/jpeg;base64,AAAA' })
    await db.kv.put({ key: 'profile.serverCols', value: true })
    await db.profiles.put({ ...blankProfile('me'), bloodType: 'O+', updatedAt: '2026-10-10T10:00:00Z' }) // server already has a blood type
    await migrateKv('me')
    expect((await db.kv.get('profile.migrated'))?.value).toBeUndefined() // not until the write is confirmed
    const p = (await db.profiles.get('me'))!
    expect(p.bloodType).toBe('O+') // server wins
    expect(p.allergies).toEqual(['Latex'])
    expect(p.conditions).toEqual(['UNKNOWN'])
    expect(p.medicines).toEqual(['Losartan'])
    expect((await db.kv.get('profile.photoUp'))?.value).toBe(true) // photo waits for upload
    const queued = await db.outbox.count()
    await migrateKv('me') // still queued: waits, writes nothing more
    expect(await db.outbox.count()).toBe(queued)
    await db.outbox.clear() // the PATCH went through
    await migrateKv('me')
    expect((await db.kv.get('profile.migrated'))?.value).toBe(true)
  })
})

describe('migration flag only after a confirmed write', () => {
  const seed = async () => {
    await db.kv.put({ key: 'profile.about', value: { allergies: 'Latex' } })
  }
  it('does not set it while the profile columns are missing (0010 not applied)', async () => {
    await seed()
    await migrateKv('me')
    expect(await db.outbox.count()).toBe(0)
    expect((await db.kv.get('profile.migrated'))?.value).toBeUndefined()
    await applyPulledProfiles([{ id: 'me', display_name: 'Mama' }], 'me') // old select: still no columns
    await migrateKv('me')
    expect((await db.kv.get('profile.migrated'))?.value).toBeUndefined()
  })
  it('does not set it when the PATCH dead-lettered, and tries again', async () => {
    await seed()
    await db.kv.put({ key: 'profile.serverCols', value: true })
    await migrateKv('me')
    expect(await db.outbox.count()).toBe(1)
    await db.outbox.clear()
    await db.kv.put({ key: 'sync.dead', value: [{ table: 'people_profile' }] }) // 400 parked it
    await migrateKv('me')
    expect((await db.kv.get('profile.migrated'))?.value).toBeUndefined()
    await migrateKv('me') // retry queues a fresh write
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('two people on one phone', () => {
  it('pending photo and wizard answers of A never reach B', async () => {
    await saveProfile('A', { allergies: ['Latex'] })
    await db.kv.put({ key: 'profile.photo', value: 'data:image/jpeg;base64,AAAA' })
    await db.kv.put({ key: 'profile.photoUp', value: true })
    await db.kv.put({ key: 'profile.serverCols', value: true })
    await db.outbox.clear()
    await migrateKv('B') // B signs in on the same phone
    await (await import('./profile')).adoptPerson('B')
    expect((await db.kv.get('profile.photo'))?.value).toBeUndefined()
    expect((await db.kv.get('profile.photoUp'))?.value).toBeUndefined()
    expect((await db.kv.get('profile.about'))?.value).toBeUndefined()
    await migrateKv('B')
    expect(await db.outbox.count()).toBe(0) // nothing of A's is written into B
    expect((await db.kv.get('profile.selfId'))?.value).toBe('B')
  })
  it('a photo picked by B is uploaded as B', async () => {
    await saveProfile('A', { phone: '1' })
    await (await import('./profile')).savePhoto('B', 'data:image/jpeg;base64,AAAA') // supabase client is absent: stays pending, owned by B
    expect((await db.kv.get('profile.selfId'))?.value).toBe('B')
    expect((await db.kv.get('profile.photoUp'))?.value).toBe(true)
  })
})
