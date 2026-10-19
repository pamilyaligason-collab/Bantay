import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetSyncForTests, startSync, syncNow } from '../sync/sync'
import { fromRow, toRow } from '../sync/tables'
import { dayKey, eventsOn, instant, isMine, nextEvent, toEvent, weekOf } from './events'
import { addNote, sortNotes, saveNote, removeNote } from './notes'
import { ageOf, checkInLabel, lastCheckIn, latestCheckIns, rollCall, type FamilyPerson } from './roster'
import { fdb } from './store'
import { addTask, removeTask, sortTasks, toggleTask } from './tasks'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const outbox = () => db.outbox.orderBy('id').toArray()
const body = (o: { payload: unknown }) => toRow('family_tasks', o.payload, (o.payload as { client_id: string }).client_id)

beforeEach(async () => {
  await Promise.all([db.outbox.clear(), db.kv.clear(), fdb.tasks.clear(), fdb.events.clear(), fdb.notes.clear(), ldb.activity.clear(), hdb.people.clear()])
  resetSyncForTests()
})
afterEach(() => vi.unstubAllGlobals())

describe('tasks', () => {
  it('addTask saves locally and queues one upsert with a client_id and no local id', async () => {
    const t = await addTask({ title: '  Buy medicines ', due: '2026-10-23', assigneePersonId: 'p1' })
    expect(t).toMatchObject({ title: 'Buy medicines', due: '2026-10-23', assigneePersonId: 'p1', done: false })
    expect(await fdb.tasks.count()).toBe(1)
    const [row] = await outbox()
    expect(row!.table).toBe('family_tasks')
    expect(row!.payload).toMatchObject({ client_id: t!.clientId })
    expect(row!.payload).not.toHaveProperty('id')
    expect(body(row!)).toEqual({ title: 'Buy medicines', due: '2026-10-23', assignee_person_id: 'p1', done: false, deleted_at: null, client_id: t!.clientId })
  })

  it('unknown stays null: no due date and no assignee are sent as null, never 0 or empty', async () => {
    await addTask({ title: 'Charge power banks', due: '', assigneePersonId: '' })
    const [row] = await outbox()
    expect(body(row!)).toMatchObject({ due: null, assignee_person_id: null })
  })

  it('an empty title saves nothing', async () => {
    expect(await addTask({ title: '   ' })).toBeNull()
    expect(await fdb.tasks.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('ticking edits the same local row and queues a full-row upsert on the same client_id', async () => {
    const t = (await addTask({ title: 'Refill jugs' }))!
    await toggleTask(t)
    const rows = await fdb.tasks.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.done).toBe(true)
    const q = await outbox()
    expect(q).toHaveLength(2)
    expect(body(q[1]!)).toMatchObject({ title: 'Refill jugs', done: true, client_id: t.clientId })
  })

  it('delete removes the local row and queues a soft delete that still carries the NOT NULL columns', async () => {
    const t = (await addTask({ title: 'Old task' }))!
    await removeTask((await fdb.tasks.toArray())[0]!)
    expect(await fdb.tasks.count()).toBe(0)
    const q = await outbox()
    const last = body(q[q.length - 1]!)
    expect(last.title).toBe('Old task')
    expect(typeof last.deleted_at).toBe('string')
    expect(last.client_id).toBe(t.clientId)
  })

  it('open tasks come first, soonest due first, undated last, done at the bottom', () => {
    const mk = (title: string, due: string | null, done = false) => ({ clientId: title, title, due, assigneePersonId: null, done })
    expect(sortTasks([mk('c', null), mk('done', '2026-10-01', true), mk('b', '2026-10-25'), mk('a', '2026-10-22')]).map((t) => t.title)).toEqual(['a', 'b', 'c', 'done'])
  })
})

describe('events', () => {
  it('builds an instant in the phone time zone and refuses a bad day', () => {
    expect(dayKey(new Date(instant('2026-10-20', '18:30')!))).toBe('2026-10-20')
    expect(new Date(instant('2026-10-20', '18:30')!).getHours()).toBe(18)
    expect(instant('20/10/2026', null)).toBeNull()
    expect(instant('2026-13-40', null)).toBeNull()
    expect(toEvent({ title: '', date: '2026-10-20' })).toBeNull()
  })

  it('an end before the start is dropped (unknown), an all-day event ignores times', () => {
    expect(toEvent({ title: 'Clinic', date: '2026-10-29', time: '09:00', endTime: '08:00' })!.endsAt).toBeNull()
    expect(toEvent({ title: 'Clinic', date: '2026-10-29', time: '09:00', endTime: '10:00' })!.endsAt).not.toBeNull()
    const all = toEvent({ title: 'Birthday', date: '2026-10-29', time: '09:00', endTime: '10:00', allDay: true })!
    expect(all.allDay).toBe(true)
    expect(all.endsAt).toBeNull()
    expect(new Date(all.startsAt).getHours()).toBe(0)
  })

  it('the agenda lists one day, all-day first then by time; weekOf starts on Monday', () => {
    const ev = [toEvent({ title: 'dinner', date: '2026-10-20', time: '18:30' })!, toEvent({ title: 'meds', date: '2026-10-20', time: '08:00' })!, toEvent({ title: 'trip', date: '2026-10-20', allDay: true })!, toEvent({ title: 'other', date: '2026-10-21', time: '09:00' })!]
    expect(eventsOn(ev, '2026-10-20').map((e) => e.title)).toEqual(['trip', 'meds', 'dinner'])
    const wk = weekOf(new Date(2026, 9, 20)) // Tuesday
    expect(wk.map((d) => d.getDate())).toEqual([19, 20, 21, 22, 23, 24, 25])
    expect(wk[0]!.getDay()).toBe(1)
    expect(nextEvent(ev, new Date(2026, 9, 20, 12))!.title).toBe('dinner')
    expect(nextEvent(ev, new Date(2027, 0, 1))).toBeNull()
  })

  it('"Mine" shows my events and whole-family ones, not someone else\'s', () => {
    expect(isMine(null, 'me')).toBe(true)
    expect(isMine('me', 'me')).toBe(true)
    expect(isMine('other', 'me')).toBe(false)
    expect(isMine('other', null)).toBe(false)
  })
})

describe('notes', () => {
  it('add, pin, delete; pinned sort first', async () => {
    const a = (await addNote({ body: 'Wi-Fi: abc' }))!
    const b = (await addNote({ body: 'Gate 1234', pinned: true }))!
    expect(await addNote({ body: ' ' })).toBeNull()
    expect(sortNotes(await fdb.notes.toArray()).map((n) => n.clientId)).toEqual([b.clientId, a.clientId])
    await saveNote({ ...a, pinned: true })
    await removeNote((await fdb.notes.toArray())[0]!)
    expect(await fdb.notes.count()).toBe(1)
    const q = await outbox()
    expect(q.map((r) => r.table)).toEqual(Array(4).fill('family_notes'))
  })
})

describe('sync mapping', () => {
  it('events and notes map to the 0012 columns', () => {
    const e = toEvent({ title: 'Dinner', date: '2026-10-20', time: '18:30', personId: 'p1' }, 'c1')!
    expect(toRow('family_events', { ...e, deletedAt: null }, 'c1')).toEqual({ title: 'Dinner', starts_at: e.startsAt, ends_at: null, all_day: false, person_id: 'p1', deleted_at: null, client_id: 'c1' })
    expect(toRow('family_notes', { body: 'x', pinned: true, deletedAt: null, id: 3 }, 'c2')).toEqual({ body: 'x', pinned: true, deleted_at: null, client_id: 'c2' })
    expect(fromRow('family_tasks', { client_id: 'c3', title: 'T', due: null, assignee_person_id: null, done: false, deleted_at: null })).toEqual({ clientId: 'c3', title: 'T', done: false })
  })

  const URL = 'https://x.supabase.test'
  const cfg = { url: URL, key: 'pk', getToken: async () => 'tok' }
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

  it('push sends a POST upsert on client_id, then pull adds a row from another phone and removes a tombstoned one', async () => {
    const t = (await addTask({ title: 'Mine' }))!
    const gone = (await addTask({ title: 'Will vanish' }))!
    await db.outbox.clear() // the two pushes are not under test here
    const sent: { url: string; method: string; prefer: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      if (method === 'POST') { sent.push({ url, method, prefer: (init.headers as Record<string, string>).Prefer!, body: JSON.parse(init.body as string) }); return new Response(null, { status: 201 }) }
      if (url.includes('/family_tasks?')) {
        return json([
          { id: 'x1', client_id: 'from-other', title: 'Buy rice', due: '2026-10-24', assignee_person_id: 'p9', done: false, updated_at: '2026-10-19T01:00:00Z', deleted_at: null },
          { id: 'x2', client_id: gone.clientId, title: 'Will vanish', due: null, assignee_person_id: null, done: false, updated_at: '2026-10-19T02:00:00Z', deleted_at: '2026-10-19T02:00:00Z' },
          { id: 'x3', client_id: t.clientId, title: 'Mine (edited elsewhere)', due: null, assignee_person_id: null, done: true, updated_at: '2026-10-19T03:00:00Z', deleted_at: null }
        ])
      }
      if (url.includes('/family_events?')) return json({ code: 'PGRST205' }, 404) // migration not applied yet: must not stop the rest of the sync
      return json([])
    })
    await toggleTask(t) // queued edit goes out first
    startSync(cfg)()
    await syncNow()
    const post = sent.find((s) => s.url.includes('family_tasks'))!
    expect(post.url).toContain('on_conflict=client_id')
    expect(post.prefer).toContain('resolution=merge-duplicates')
    expect(post.body).toMatchObject({ client_id: t.clientId, title: 'Mine', done: true, due: null })
    const rows = await fdb.tasks.toArray()
    expect(rows.map((r) => r.title).sort()).toEqual(['Buy rice', 'Mine (edited elsewhere)'])
    expect(rows.find((r) => r.clientId === 'from-other')).toMatchObject({ due: '2026-10-24', assigneePersonId: 'p9', done: false })
    expect(await db.kv.get('sync.backoff')).toBeUndefined() // the missing events table did not put sync into backoff
  })
})

describe('roll call', () => {
  const me: FamilyPerson = { id: 'p1', name: 'Lloyd', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true }
  const kuya: FamilyPerson = { ...me, id: 'p2', name: 'Kuya Ben', isMe: false }
  const now = new Date(2026, 9, 20, 10, 0)

  it('keeps the latest check-in per person and ignores other activity', () => {
    expect(latestCheckIns([
      { personId: 'p1', kind: 'check-in', startedAt: '2026-10-20T00:00:00.000Z' },
      { personId: 'p1', kind: 'check-in', startedAt: '2026-10-20T02:00:00.000Z' },
      { personId: 'p1', kind: 'walk', startedAt: '2026-10-20T05:00:00.000Z' },
      { personId: 'p2', kind: 'mood-good', startedAt: '2026-10-20T05:00:00.000Z' }
    ])).toEqual({ p1: '2026-10-20T02:00:00.000Z' })
  })

  it('says OK with the time for today, else "No check-in today"', () => {
    const today = new Date(2026, 9, 20, 7, 40).toISOString()
    expect(checkInLabel(today, now)).toEqual({ ok: true, text: expect.stringMatching(/^OK 7:40/) })
    expect(checkInLabel(new Date(2026, 9, 19, 7, 40).toISOString(), now)).toEqual({ ok: false, text: 'No check-in today' })
    expect(checkInLabel(undefined, now)).toEqual({ ok: false, text: 'No check-in today' })
    expect(checkInLabel('garbage', now).ok).toBe(false)
    expect(lastCheckIn(undefined)).toBeNull()
    expect(lastCheckIn(today)).toMatch(/7:40/)
  })

  it('counts who is OK today', () => {
    expect(rollCall([me, kuya], { p1: new Date(2026, 9, 20, 7, 0).toISOString() }, now)).toEqual({ ok: 1, total: 2 })
    expect(rollCall([], {}, now)).toEqual({ ok: 0, total: 0 })
  })

  it('age is whole years, null when unknown or impossible', () => {
    expect(ageOf('1950-10-21', now)).toBe(75)
    expect(ageOf('1950-10-20', now)).toBe(76)
    expect(ageOf(null, now)).toBeNull()
    expect(ageOf('2030-01-01', now)).toBeNull()
    expect(ageOf('not-a-date', now)).toBeNull()
  })
})
