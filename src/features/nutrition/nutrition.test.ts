import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { track } from '../admin/events'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { DEAD_KEY, resetSyncForTests, startSync, syncNow, type DeadLetter } from '../sync/sync'
import { fromRow, toRow } from '../sync/tables'
import { logPlate, logSameAsYesterday, logWater, removeFood, saveGoal, undoWater } from './actions'
import { FOODS, foodByKey } from './logic'

vi.mock('../admin/events', async (orig) => ({ ...(await orig<typeof import('../admin/events')>()), track: vi.fn(async () => true) }))
const who = vi.hoisted(() => ({ id: 'p-me' as string | null }))
vi.mock('../auth/session', async (orig) => ({ ...(await orig<typeof import('../auth/session')>()), getMember: async () => (who.id ? { personId: who.id, userId: 'u1', role: 'member' } : null) }))

const URL = 'https://x.supabase.test'
const cfg = { url: URL, key: 'pk', getToken: async () => 'tok' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const outbox = () => db.outbox.orderBy('id').toArray()
type Call = { url: string; method: string; body?: string }
let calls: Call[]
function mockFetch(h: (c: Call) => Response) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET', body: init.body as string | undefined }
    calls.push(c)
    return h(c)
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  who.id = 'p-me'
  await Promise.all([db.outbox.clear(), db.kv.clear(), ldb.food.clear(), ldb.water.clear(), ldb.goals.clear(), ldb.activity.clear(), hdb.readings.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('logging', () => {
  it('a plate is one local row per food plus one outbox upsert each, with the portion already applied and no local id', async () => {
    const adobo = foodByKey('chicken_adobo')!
    expect(await logPlate([{ food: adobo, portion: 1.5 }, { food: foodByKey('rice_white')!, portion: 1 }], 'lunch', new Date('2026-10-21T04:00:00Z'))).toBe('ok')
    const rows = await ldb.food.toArray()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ personId: 'p-me', meal: 'lunch', foodKey: 'chicken_adobo', portion: 1.5, sodiumMg: Math.round(adobo.sodium_mg! * 1.5) })
    const q = await outbox()
    expect(q.map((r) => r.table)).toEqual(['food_entries', 'food_entries'])
    const payload = q[0]!.payload as Record<string, unknown>
    expect('id' in payload).toBe(false)
    expect(payload.client_id).toBe(rows[0]!.clientId)
    expect(toRow('food_entries', payload, payload.client_id as string)).toMatchObject({ person_id: 'p-me', meal: 'lunch', food_key: 'chicken_adobo', portion: 1.5, deleted_at: null, client_id: rows[0]!.clientId })
    expect(Object.keys(toRow('food_entries', payload)).sort()).toEqual(['b12_ug', 'calcium_mg', 'carbs_g', 'deleted_at', 'eaten_at', 'fat_g', 'fiber_g', 'food_key', 'iron_mg', 'kcal', 'magnesium_mg', 'meal', 'name', 'person_id', 'portion', 'potassium_mg', 'protein_g', 'sat_fat_g', 'serving_label', 'sodium_mg', 'sugars_g', 'vitd_ug'])
  })

  it('signed out writes nothing and says so', async () => {
    who.id = null
    expect(await logPlate([{ food: FOODS[0]!, portion: 1 }], 'lunch')).toBe('signedout')
    expect(await logWater()).toBe('signedout')
    expect(await ldb.food.count() + await ldb.water.count() + await db.outbox.count()).toBe(0)
  })

  it('S16: with a named person the plate, the same-as-yesterday copy and the water go to that person, never to the signed-in one', async () => {
    const now = new Date('2026-10-21T04:00:00Z')
    expect(await logPlate([{ food: foodByKey('rice_white')!, portion: 1 }], 'lunch', now, 'p-mama')).toBe('ok')
    expect(await logWater(250, now, 'p-mama')).toBe('ok')
    expect((await ldb.food.toArray()).map((f) => f.personId)).toEqual(['p-mama'])
    expect((await ldb.water.toArray()).map((w) => w.personId)).toEqual(['p-mama'])
    const y = new Date(now.getTime() + 86_400_000)
    expect((await logSameAsYesterday('lunch', y, 'p-mama')).added).toBe(1)
    expect((await ldb.food.toArray()).every((f) => f.personId === 'p-mama')).toBe(true)
    await undoWater(now, 'p-mama')
    expect(await ldb.water.count()).toBe(0)
    expect((await ldb.food.where('personId').equals('p-me').count()) + (await ldb.water.where('personId').equals('p-me').count())).toBe(0)
  })

  it('water is 250 ml a tap, undo takes back the latest glass with a tombstone', async () => {
    const now = new Date()
    await logWater(250, new Date(now.getTime() - 60_000))
    await logWater(250, now)
    expect((await ldb.water.toArray()).map((w) => w.ml)).toEqual([250, 250])
    await undoWater(now)
    expect(await ldb.water.count()).toBe(1)
    const q = await outbox()
    expect(q.map((r) => r.table)).toEqual(['water_entries', 'water_entries', 'water_entries'])
    expect(toRow('water_entries', q[2]!.payload)).toMatchObject({ ml: 250, person_id: 'p-me' })
    expect((toRow('water_entries', q[2]!.payload) as { deleted_at: string }).deleted_at).toMatch(/^20/)
  })

  it('removing a food deletes it here and queues a soft delete', async () => {
    await logPlate([{ food: foodByKey('patis')!, portion: 1 }], 'lunch')
    await removeFood((await ldb.food.toArray())[0]!)
    expect(await ldb.food.count()).toBe(0)
    const last = (await outbox()).pop()!
    expect((last.payload as { deletedAt: string }).deletedAt).toMatch(/^20/)
  })

  it('Same as yesterday copies that meal once, and says 0 when yesterday had none', async () => {
    const now = new Date(2026, 9, 21, 8, 0)
    expect((await logSameAsYesterday('breakfast', now)).added).toBe(0)
    await logPlate([{ food: foodByKey('pandesal')!, portion: 1 }, { food: foodByKey('fried_egg')!, portion: 1 }], 'breakfast', new Date(2026, 9, 20, 7, 0))
    const r = await logSameAsYesterday('breakfast', now)
    expect(r).toEqual({ result: 'ok', added: 2 })
    expect(await ldb.food.count()).toBe(4)
    expect(new Set((await ldb.food.toArray()).map((e) => e.clientId)).size).toBe(4)
  })

  it('a goal is saved locally and queued as an upsert on person_id', async () => {
    expect(await saveGoal('p-me', { sodiumMg: 1500 })).toBe('ok')
    expect(await ldb.goals.get('p-me')).toEqual({ personId: 'p-me', sodiumMg: 1500, waterMl: 1500, potassiumMg: null, sex: null })
    const [r] = await outbox()
    expect(r!.table).toBe('nutrition_goals')
    expect(toRow('nutrition_goals', r!.payload, 'ignored')).toEqual({ person_id: 'p-me', sodium_mg: 1500, water_ml: 1500, potassium_mg: null, sex: null })
  })
})

describe('privacy (B-7)', () => {
  it('usage events carry only fixed names, never a food name', async () => {
    await logPlate([{ food: foodByKey('chicken_adobo')!, portion: 1 }], 'lunch')
    await logWater()
    await saveGoal('p-me', { sodiumMg: 2000 })
    await logSameAsYesterday('lunch')
    const sent = vi.mocked(track).mock.calls
    expect(sent.length).toBeGreaterThanOrEqual(3)
    for (const [kind, name] of sent) {
      expect(kind).toBe('action')
      expect(['meal_logged', 'water_logged', 'salt_goal_set']).toContain(name)
    }
    const names = FOODS.flatMap((f) => [f.key, f.name, f.tl].map((s) => s.toLowerCase()))
    expect(sent.some(([, n]) => names.includes(String(n).toLowerCase()))).toBe(false)
  })
  it('the real allowlist refuses a food name and accepts the three fixed ones', async () => {
    const { track: real } = await vi.importActual<typeof import('../admin/events')>('../admin/events')
    expect(await real('action', 'Chicken adobo')).toBe(false)
    expect(await real('action', 'chicken_adobo')).toBe(false)
    expect(await real('screen', 'patis')).toBe(false)
  })
})

describe('sync before migration 0024 is applied', () => {
  it('a missing table keeps the rows queued and local, does not dead-letter, does not back off, and the other tables still go', async () => {
    await logPlate([{ food: foodByKey('toyo')!, portion: 1 }], 'lunch')
    await logWater()
    await saveGoal('p-me', { sodiumMg: 1500 })
    const rid = await hdb.readings.add({ personId: 'p-me', takenAt: '2026-10-21T01:00:00Z', test: 'weight', value: 60, unit: 'kg' })
    await db.outbox.add({ table: 'readings', op: 'insert', payload: { personId: 'p-me', takenAt: '2026-10-21T01:00:00Z', test: 'weight', value: 60, unit: 'kg', id: rid }, createdAt: Date.now(), tries: 0 })
    mockFetch((c) => {
      if (c.method === 'POST' && /\/(food_entries|water_entries|nutrition_goals)\?/.test(c.url)) return json({ code: 'PGRST205', message: "Could not find the table 'public.food_entries' in the schema cache" }, 404)
      if (c.method === 'POST') return new Response(null, { status: 201 })
      return /\/(food_entries|water_entries|nutrition_goals)\?/.test(c.url) ? json({ code: 'PGRST205' }, 404) : json([]) // pulls of the missing tables are skipped, the rest answer empty
    })
    startSync(cfg)()
    await syncNow()
    expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/readings?'))).toHaveLength(1)
    const q = await outbox()
    expect(q.map((r) => r.table).sort()).toEqual(['food_entries', 'nutrition_goals', 'water_entries'])
    expect(q.every((r) => r.tries === 0)).toBe(true)
    expect(((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []).toEqual([])
    expect(await db.kv.get('sync.backoff')).toBeUndefined()
    expect(await ldb.food.count()).toBe(1)
    expect(await ldb.water.count()).toBe(1)
    expect(await ldb.goals.count()).toBe(1)
    // the table appears: the same rows go up on the next run, with their original client ids
    const cid = (await ldb.food.toArray())[0]!.clientId
    mockFetch((c) => (c.method === 'POST' ? new Response(null, { status: 201 }) : json([])))
    await syncNow(true)
    expect(await db.outbox.count()).toBe(0)
    const foodPost = calls.find((c) => c.method === 'POST' && c.url.includes('/food_entries?'))!
    expect(foodPost.url).toContain('on_conflict=client_id')
    expect(JSON.parse(foodPost.body!).client_id).toBe(cid)
    expect(calls.find((c) => c.url.includes('/nutrition_goals?on_conflict=person_id'))).toBeTruthy()
  })

  it('other missing-table errors on non-nutrition tables still park the row as before', async () => {
    await db.outbox.add({ table: 'family_events', op: 'upsert', payload: { client_id: 'e1', title: 'x', startsAt: '2026-10-21T01:00:00Z', allDay: false, deletedAt: null }, createdAt: Date.now(), tries: 0 })
    mockFetch((c) => (c.method === 'POST' ? json({ code: 'PGRST205' }, 404) : json([])))
    startSync(cfg)()
    await syncNow()
    expect(await db.outbox.count()).toBe(0)
    expect(((await db.kv.get(DEAD_KEY))?.value as DeadLetter[]).map((d) => d.table)).toEqual(['family_events'])
  })
})

describe('pull', () => {
  it('adds meals from another phone, applies edits by client_id, removes tombstones, and keeps null as unknown', async () => {
    await ldb.food.add({ clientId: 'gone', personId: 'p-ma', eatenAt: '2026-10-21T01:00:00Z', meal: 'lunch', foodKey: 'x', name: 'X', portion: 1, servingLabel: null, kcal: 1, sodiumMg: 1, potassiumMg: null, proteinG: null })
    // my own goal edit is still queued: the server copy must not overwrite it
    await ldb.goals.put({ personId: 'p-me', sodiumMg: 2000, waterMl: 1500 })
    await db.outbox.add({ table: 'nutrition_goals', op: 'upsert', payload: { personId: 'p-me', sodiumMg: 2000, waterMl: 1500 }, createdAt: Date.now(), tries: 0 })
    mockFetch((c) => {
      if (c.method === 'POST') return json({ code: 'PGRST205' }, 404) // keep my queued goal queued
      if (c.url.includes('/food_entries?')) return json([{ client_id: 'from-ma', person_id: 'p-ma', eaten_at: '2026-10-21T02:00:00Z', meal: 'dinner', food_key: 'tinola', name: 'Chicken ginger soup', portion: 1, serving_label: '1 bowl', kcal: null, sodium_mg: 800, potassium_mg: null, protein_g: null, deleted_at: null, updated_at: '2026-10-21T03:00:00Z' }, { client_id: 'gone', person_id: 'p-ma', eaten_at: '2026-10-21T01:00:00Z', meal: 'lunch', name: 'X', portion: 1, deleted_at: '2026-10-21T04:00:00Z', updated_at: '2026-10-21T04:00:00Z' }])
      if (c.url.includes('/nutrition_goals?')) return json([{ person_id: 'p-ma', sodium_mg: 1500, water_ml: 1200, updated_at: '2026-10-21T03:00:00Z' }, { person_id: 'p-me', sodium_mg: 1500, water_ml: 1500, updated_at: '2026-10-21T03:00:00Z' }])
      return json([])
    })
    startSync(cfg)()
    await syncNow()
    const rows = await ldb.food.toArray()
    expect(rows.map((r) => r.clientId)).toEqual(['from-ma'])
    expect(rows[0]).toMatchObject({ foodKey: 'tinola', sodiumMg: 800, kcal: null, potassiumMg: null, proteinG: null })
    expect(await ldb.goals.get('p-ma')).toMatchObject({ sodiumMg: 1500, waterMl: 1200 })
    expect((await ldb.goals.get('p-me'))!.sodiumMg).toBe(2000)
  })

  it('fromRow keeps null for unknown nutrients', () => {
    expect(fromRow('food_entries', { client_id: 'c', person_id: 'p', kcal: null, sodium_mg: 5, deleted_at: null })).toEqual({ clientId: 'c', personId: 'p', kcal: null, sodiumMg: 5 })
  })
})
