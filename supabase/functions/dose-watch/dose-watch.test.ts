// @vitest-environment node
// Fixed clock: NOW = 2026-10-20 10:05 Asia/Manila (02:05 UTC). All names and times are made up.
import { describe, expect, it } from 'vitest'
import { buildNotification } from '../../../src/features/notify/templates'
import {
  type Carer, doseWatchPayload, doseWatchText, dueSlots, firstName, type MedRow, type Port, recipients, runDoseWatch, scheduleTimes, type Sub, type TakenRow
} from './logic.ts'

const NOW = Date.parse('2026-10-20T10:05:00+08:00')
const med = (over: Partial<MedRow> = {}): MedRow => ({ id: 'm1', person_id: 'p1', med_status: 'active', deleted_at: null, as_needed: false, schedule: { v: 1, times: ['08:00'] }, ...over })
const took = (over: Partial<TakenRow> = {}): TakenRow => ({ person_id: 'p1', medication_id: 'm1', slot: '08:00', taken_at: '2026-10-20T08:10:00+08:00', ...over })

describe('dueSlots', () => {
  it('a slot is missed exactly 2 h after its time, not before', () => {
    expect(dueSlots([med()], [], Date.parse('2026-10-20T09:59:00+08:00'))).toEqual([])
    expect(dueSlots([med()], [], Date.parse('2026-10-20T10:00:00+08:00'))).toEqual([{ personId: 'p1', day: '2026-10-20', slot: '08:00' }])
    expect(dueSlots([med()], [], NOW)).toHaveLength(1)
  })
  it('a taken or a skipped row for that slot closes it', () => {
    expect(dueSlots([med()], [took()], NOW)).toEqual([])
    expect(dueSlots([med()], [took({ taken_at: '2026-10-20T09:50:00+08:00' })], NOW)).toEqual([])
  })
  it('a row for another slot, another medicine or another day does not', () => {
    expect(dueSlots([med()], [took({ slot: '20:00' })], NOW)).toHaveLength(1)
    expect(dueSlots([med()], [took({ medication_id: 'm2' })], NOW)).toHaveLength(1)
    expect(dueSlots([med()], [took({ taken_at: '2026-10-19T08:10:00+08:00' })], NOW)).toHaveLength(1)
  })
  it('uses the Manila day, not UTC: 07:30 Manila is the previous UTC day', () => {
    expect(dueSlots([med({ schedule: ['06:00'] })], [took({ slot: '06:00', taken_at: '2026-10-19T22:30:00Z' })], NOW)).toEqual([])
  })
  it('skips paused, stopped, deleted, as-needed and untimed medicines', () => {
    for (const m of [med({ med_status: 'paused' }), med({ med_status: 'stopped' }), med({ deleted_at: '2026-10-01T00:00:00Z' }), med({ as_needed: true }), med({ schedule: { v: 1, times: [], needs_time: true } })]) {
      expect(dueSlots([m], [], NOW)).toEqual([])
    }
  })
  it('skips every medicine still in review (not yet confirmed), whatever the date', () => {
    const s = (since: string) => ({ v: 1, times: ['08:00'], review: true, review_since: since })
    expect(dueSlots([med({ schedule: s('2026-10-20') })], [], NOW)).toEqual([])
    expect(dueSlots([med({ schedule: s('2026-10-01') })], [], NOW)).toEqual([])
    expect(dueSlots([med({ schedule: { v: 1, times: ['08:00'], review: false } })], [], NOW)).toHaveLength(1)
  })
  it('skips needs_time, not started yet and already stopped medicines', () => {
    expect(dueSlots([med({ schedule: { v: 1, times: ['08:00'], needs_time: true } })], [], NOW)).toEqual([])
    expect(dueSlots([med({ started_on: '2026-10-21' })], [], NOW)).toEqual([])
    expect(dueSlots([med({ started_on: '2026-10-20' })], [], NOW)).toHaveLength(1)
    expect(dueSlots([med({ stopped_on: '2026-10-19' })], [], NOW)).toEqual([])
    expect(dueSlots([med({ stopped_on: '2026-10-20' })], [], NOW)).toHaveLength(1)
  })
  it('an old dose row with no slot and no medication id covers one slot by normalised name', () => {
    const two = med({ name: 'Metformin 500 mg tab', schedule: { v: 1, times: ['06:00', '08:00'] } })
    const old = (name: string, medication_id: string | null = null) => took({ medication_id, slot: null, name, taken_at: '2026-10-20T07:00:00+08:00' })
    expect(dueSlots([two], [old('METFORMIN 850mg')], NOW)).toEqual([{ personId: 'p1', day: '2026-10-20', slot: '08:00' }]) // earliest covered
    expect(dueSlots([two], [old('Metformin'), old('metformin')], NOW)).toEqual([])
    expect(dueSlots([two], [old('Losartan')], NOW)).toHaveLength(2)
    expect(dueSlots([med({ name: 'Metformin' })], [old('x', 'm1')], NOW)).toEqual([]) // by medication id, slot null
    expect(dueSlots([med({ name: 'Metformin' })], [{ ...old('Metformin'), taken_at: '2026-10-19T07:00:00+08:00' }], NOW)).toHaveLength(1) // another day
  })
  it('two medicines in one slot make one alert; one open medicine keeps it open', () => {
    const two = [med(), med({ id: 'm2' })]
    expect(dueSlots(two, [], NOW)).toHaveLength(1)
    expect(dueSlots(two, [took()], NOW)).toHaveLength(1)
    expect(dueSlots(two, [took(), took({ medication_id: 'm2' })], NOW)).toEqual([])
  })
  it('never alerts for a slot older than 6 h, but does reach back across midnight', () => {
    expect(dueSlots([med({ schedule: ['02:00'] })], [], NOW)).toEqual([]) // 8 h ago
    const late = Date.parse('2026-10-21T01:10:00+08:00')
    expect(dueSlots([med({ schedule: ['23:00'] })], [], late)).toEqual([{ personId: 'p1', day: '2026-10-20', slot: '23:00' }])
  })
  it('ignores bad times', () => {
    expect(scheduleTimes({ v: 1, times: ['8am', '25:00', '08:00', '08:00'] })).toEqual(['08:00'])
  })
})

describe('text and recipients (B-7)', () => {
  it('first name only, generic wording, and the phone shows exactly that text', () => {
    expect(firstName('Maria Santos')).toBe('Maria')
    expect(firstName('  ')).toBe('Someone')
    expect(firstName('J0hn <b>')).toBe('Jhn')
    expect(firstName('Lola Rosa Santos')).toBe('Lola Rosa')
    expect(firstName('Dr. Cruz')).toBe('Dr. Cruz')
    expect(firstName('Lola')).toBe('Lola')
    expect(firstName('Niño Reyes')).toBe('Niño')
    expect(firstName('Maria Lourdes')).toBe('Maria')
    expect([...firstName('Ate ' + '😀'.repeat(2) + 'é'.repeat(40))].length).toBeLessThanOrEqual(24)
    expect(doseWatchText('Maria')).toBe('Maria has not marked a medicine (2 h).')
    const n = buildNotification(doseWatchPayload('Maria Santos'))!
    expect(n.body).toBe('Maria has not marked a medicine (2 h).')
    expect(n.cls).toBe('carer')
  })
  it('the payload holds only t and the first name, never a medicine', () => {
    const p = doseWatchPayload('Maria Santos')
    expect(Object.keys(p).sort()).toEqual(['n', 't'])
    expect(JSON.stringify(p)).not.toMatch(/metformin|mg|\d/i)
  })
  it('only writer carers, never the person themselves', () => {
    const carers: Carer[] = [
      { carer_id: 'w1', person_id: 'p1', can_write: true }, { carer_id: 'r1', person_id: 'p1', can_write: false },
      { carer_id: 'self', person_id: 'p1', can_write: true }, { carer_id: 'w2', person_id: 'p2', can_write: true }
    ]
    expect(recipients('p1', carers, 'self')).toEqual(['w1'])
  })
})

function fakePort(over: { meds?: MedRow[]; taken?: TakenRow[]; status?: number | null } = {}) {
  const claimed = new Set<string>()
  const pushes: { sub: Sub; payload: unknown }[] = []
  const removed: string[] = []
  const port: Port = {
    medications: async () => over.meds ?? [med()],
    taken: async () => over.taken ?? [],
    person: async () => ({ display_name: 'Maria Santos', auth_user_id: 'self' }),
    carers: async () => [{ carer_id: 'w1', person_id: 'p1', can_write: true }, { carer_id: 'w2', person_id: 'p1', can_write: true }],
    subs: async (ids) => ids.map((u) => ({ user_id: u, endpoint: `https://push/${u}`, p256dh: 'k', auth: 'a' })),
    claim: async (p, d, s) => { const k = `${p}|${d}|${s}`; if (claimed.has(k)) return false; claimed.add(k); return true },
    push: async (sub, payload) => { pushes.push({ sub, payload }); return over.status === undefined ? 201 : over.status },
    release: async (p, d, sl) => { claimed.delete(`${p}|${d}|${sl}`) },
    removeSub: async (e) => { removed.push(e) }
  }
  return { port, pushes, removed }
}

describe('runDoseWatch', () => {
  it('sends one push per writer carer device with the generic payload', async () => {
    const f = fakePort()
    const r = await runDoseWatch(f.port, NOW)
    expect(r).toEqual({ due: 1, claimed: 1, sent: 2, removed: 0, released: 0 })
    expect(f.pushes.map((p) => p.sub.user_id)).toEqual(['w1', 'w2'])
    expect(f.pushes[0]!.payload).toEqual({ t: 'dose_watch', n: 'Maria' })
  })
  it('is idempotent: the next 15-minute run and a run an hour later send nothing more', async () => {
    const f = fakePort()
    await runDoseWatch(f.port, NOW)
    const again = await runDoseWatch(f.port, NOW + 15 * 60_000)
    const hour = await runDoseWatch(f.port, NOW + 60 * 60_000)
    expect(again.sent + hour.sent).toBe(0)
    expect(f.pushes).toHaveLength(2)
  })
  it('releases the claim when every send failed on the network, so the next run retries; not when only some did', async () => {
    const f = fakePort({ status: null })
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ sent: 0, released: 1, claimed: 0 })
    const again = fakePort({ status: 201 })
    expect((await runDoseWatch(again.port, NOW)).sent).toBe(2)
    const f2 = fakePort({ status: null })
    await runDoseWatch(f2.port, NOW)
    expect(await runDoseWatch(f2.port, NOW)).toMatchObject({ released: 1 }) // retried once per run
  })
  it('sends nothing when the dose was marked, and drops a gone subscription', async () => {
    const quiet = fakePort({ taken: [took()] })
    expect((await runDoseWatch(quiet.port, NOW)).due).toBe(0)
    expect(quiet.pushes).toHaveLength(0)
    const gone = fakePort({ status: 410 })
    expect(await runDoseWatch(gone.port, NOW)).toMatchObject({ sent: 0, removed: 2 })
    expect(gone.removed).toEqual(['https://push/w1', 'https://push/w2'])
  })
})
