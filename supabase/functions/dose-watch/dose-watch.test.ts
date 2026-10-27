// @vitest-environment node
// Fixed clock: NOW = 2026-10-20 10:05 Asia/Manila (02:05 UTC). All names and times are made up.
import { describe, expect, it } from 'vitest'
import { reviewAgeDays as appAge } from '../../../src/features/health/meds'
import { buildNotification } from '../../../src/features/notify/templates'
import {
  type Carer, doseWatchPayload, dueSlots, inDigestWindow, isVaccine, type MedRow, openToday, type Port, recipients, reviewAgeDays, runDoseWatch, scheduleTimes, type TakenRow
} from './logic.ts'

const NOW = Date.parse('2026-10-20T10:05:00+08:00')
const med = (over: Partial<MedRow> = {}): MedRow => ({ id: 'm1', person_id: 'p1', med_status: 'active', deleted_at: null, as_needed: false, schedule: { v: 1, times: ['08:00'] }, ...over })
const took = (over: Partial<TakenRow> = {}): TakenRow => ({ person_id: 'p1', medication_id: 'm1', slot: '08:00', taken_at: '2026-10-20T08:10:00+08:00', ...over })

describe('dueSlots', () => {
  it('a slot is missed exactly 30 min after its time (Q34), not before; the cron can pass another window', () => {
    expect(dueSlots([med()], [], Date.parse('2026-10-20T08:29:00+08:00'))).toEqual([])
    expect(dueSlots([med()], [], Date.parse('2026-10-20T08:30:00+08:00'))).toEqual([{ personId: 'p1', day: '2026-10-20', slot: '08:00' }])
    expect(dueSlots([med()], [], NOW)).toHaveLength(1)
    expect(dueSlots([med()], [], Date.parse('2026-10-20T09:59:00+08:00'), 120)).toEqual([])
    expect(dueSlots([med()], [], Date.parse('2026-10-20T10:00:00+08:00'), 120)).toHaveLength(1)
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
  it('watches a review medicine once its question is more than a day old (S4); on the day it was asked and with no date it is not watched', () => {
    const s = (since?: string) => ({ v: 1, times: ['08:00'], review: true, ...(since ? { review_since: since } : {}) })
    expect(dueSlots([med({ schedule: s('2026-10-20') })], [], NOW)).toEqual([]) // asked today
    expect(dueSlots([med({ schedule: s('2026-10-19') })], [], NOW)).toHaveLength(1) // 1 day old
    expect(dueSlots([med({ schedule: s('2026-10-01') })], [], NOW)).toHaveLength(1)
    expect(dueSlots([med({ schedule: s() })], [], NOW)).toEqual([]) // unknown date is never 0 days or 99 days (ML-05)
    expect(dueSlots([med({ schedule: { v: 1, times: ['08:00'], review: false } })], [], NOW)).toHaveLength(1)
  })
  it('gives the same age as the app (health/meds.ts reviewAgeDays) for the same schedule and instant (ML-10)', () => {
    const at = (s: string) => Date.parse(s)
    for (const [schedule, now] of [
      [{ review: true, review_since: '2026-10-20' }, at('2026-10-20T10:05:00+08:00')],
      [{ review: true, review_since: '2026-10-16' }, at('2026-10-20T00:30:00+08:00')], // just after Manila midnight, still the 19th in UTC
      [{ review: true, review_since: '2026-10-16' }, at('2026-10-20T23:59:00+08:00')],
      [{ review: true, review_since: '2026-10-01' }, at('2026-11-02T08:00:00+08:00')],
      [{ review: false, review_since: '2026-10-16' }, at('2026-10-20T10:05:00+08:00')],
      [{ review: true }, at('2026-10-20T10:05:00+08:00')],
      [{ review: true, review_since: '2026-13-45' }, at('2026-10-20T10:05:00+08:00')]
    ] as const) expect(reviewAgeDays(schedule, now)).toBe(appAge({ schedule }, new Date(now)))
  })
  it('reviewAgeDays counts Manila days; null when not in review or the date is bad', () => {
    expect(reviewAgeDays({ review: true, review_since: '2026-10-20' }, NOW)).toBe(0)
    expect(reviewAgeDays({ review: true, review_since: '2026-10-16' }, NOW)).toBe(4)
    expect(reviewAgeDays({ review: true, review_since: '2026-10-19' }, Date.parse('2026-10-19T23:30:00Z'))).toBe(1) // 07:30 Manila on the 20th
    expect(reviewAgeDays({ review: false, review_since: '2026-10-01' }, NOW)).toBeNull()
    expect(reviewAgeDays({ review: true, review_since: 'soon' }, NOW)).toBeNull()
    expect(reviewAgeDays(['08:00'], NOW)).toBeNull()
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
  it('the payload is the carer template id; n is a count, never a name; the phone shows a no-name carer line', () => {
    expect(doseWatchPayload()).toEqual({ t: 'dose_watch' })
    expect(doseWatchPayload(1)).toEqual({ t: 'dose_watch' })
    expect(doseWatchPayload(3)).toEqual({ t: 'dose_watch', n: 3 })
    const n = buildNotification(doseWatchPayload())!
    expect(n.body).toBe('A medicine was missed by someone you look after.')
    expect(n.cls).toBe('carer')
    expect(buildNotification(doseWatchPayload(3))!.body).toBe('3 medicines were missed by someone you look after.')
  })
  it('only writer carers, never the person themselves', () => {
    const carers: Carer[] = [
      { carer_id: 'w1', person_id: 'p1', can_write: true }, { carer_id: 'r1', person_id: 'p1', can_write: false },
      { carer_id: 'self', person_id: 'p1', can_write: true }, { carer_id: 'w2', person_id: 'p2', can_write: true }
    ]
    expect(recipients('p1', carers, 'self')).toEqual(['w1'])
  })
})

interface Written { kind: string; personId: string; carer: string; template: string; ref: string }
/** In-memory port. carerRow dedupes on (kind, ref, carer) like the unique index on carer_alerts; `failWrites` makes it throw. */
function fakePort(over: { meds?: MedRow[]; taken?: TakenRow[]; failWrites?: boolean; carers?: Carer[] } = {}) {
  const claimed = new Set<string>()
  const rows: Written[] = []
  const port: Port = {
    medications: async () => over.meds ?? [med()],
    taken: async () => over.taken ?? [],
    person: async () => ({ display_name: 'Maria Santos', auth_user_id: 'self' }),
    carers: async () => over.carers ?? [{ carer_id: 'w1', person_id: 'p1', can_write: true }, { carer_id: 'w2', person_id: 'p1', can_write: true }],
    claim: async (p, d, s) => { const k = `${p}|${d}|${s}`; if (claimed.has(k)) return false; claimed.add(k); return true },
    release: async (p, d, sl) => { claimed.delete(`${p}|${d}|${sl}`) },
    carerRow: async (kind, personId, ids, template, ref) => {
      if (over.failWrites) throw new Error('write')
      for (const carer of ids) if (!rows.some((r) => r.kind === kind && r.ref === ref && r.carer === carer)) rows.push({ kind, personId, carer, template, ref })
    }
  }
  return { port, rows, claimed }
}
const review = (since: string | undefined, over: Partial<MedRow> = {}) => med({ schedule: { v: 1, times: ['08:00'], review: true, ...(since ? { review_since: since } : {}) }, ...over })

describe('runDoseWatch', () => {
  it('an archived person gets no claim and no row', async () => {
    const f = fakePort({ meds: [med({ people: { archived_at: '2026-10-20T00:00:00Z' } })] })
    expect(await runDoseWatch(f.port, NOW)).toEqual({ due: 0, claimed: 0, rows: 0, review: 0, digest: 0, failed: 0 })
    expect(f.rows).toHaveLength(0)
  })
  it('writes one dose_missed row per writer carer, never the person, ref person:day:slot, template dose_missed', async () => {
    const f = fakePort({ carers: [{ carer_id: 'w1', person_id: 'p1', can_write: true }, { carer_id: 'r1', person_id: 'p1', can_write: false }, { carer_id: 'self', person_id: 'p1', can_write: true }] })
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ due: 1, claimed: 1, rows: 1, failed: 0 })
    expect(f.rows).toEqual([{ kind: 'dose_missed', personId: 'p1', carer: 'w1', template: 'dose_missed', ref: 'p1:2026-10-20:08:00' }])
  })
  it('is idempotent: the next 15-minute run and a run an hour later add nothing', async () => {
    const f = fakePort()
    await runDoseWatch(f.port, NOW)
    await runDoseWatch(f.port, NOW + 15 * 60_000)
    await runDoseWatch(f.port, NOW + 60 * 60_000)
    expect(f.rows.filter((r) => r.kind === 'dose_missed')).toHaveLength(2) // w1, w2, once
  })
  it('a failed write gives the claim back and the run still returns its report (failed 1, no throw); the next run writes the row', async () => {
    const over = { failWrites: true }
    const f = fakePort(over)
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ due: 1, claimed: 0, rows: 0, failed: 1 })
    expect(f.claimed.size).toBe(0)
    over.failWrites = false
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ rows: 1, failed: 0 })
    expect(f.rows).toHaveLength(2)
  })
  it('out of budget: stops before claiming another slot; the next run picks them up', async () => {
    const f = fakePort()
    f.port.overBudget = () => true
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ due: 1, claimed: 0, rows: 0, failed: 0 })
    expect(f.rows).toEqual([])
  })
  it('one failing write does not stop the others: the other slot is still written, failed counts only the bad one', async () => {
    const f = fakePort({ meds: [med(), med({ id: 'm2', person_id: 'p2' })], carers: [{ carer_id: 'w1', person_id: 'p1', can_write: true }, { carer_id: 'w2', person_id: 'p2', can_write: true }] })
    const real = f.port.carerRow
    f.port.carerRow = async (k, p, ids, t, ref) => { if (p === 'p1') throw new Error('write'); return real(k, p, ids, t, ref) }
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ due: 2, claimed: 1, rows: 1, failed: 1 })
    expect(f.rows.map((r) => r.personId)).toEqual(['p2'])
    expect([...f.claimed]).toEqual(['p2|2026-10-20|08:00'])
  })
  it('writes nothing when the dose was marked', async () => {
    const quiet = fakePort({ taken: [took()] })
    expect((await runDoseWatch(quiet.port, NOW)).due).toBe(0)
    expect(quiet.rows).toHaveLength(0)
  })
  it('honours the window the cron passes', async () => {
    const f = fakePort()
    expect((await runDoseWatch(f.port, Date.parse('2026-10-20T08:40:00+08:00'))).rows).toBe(1)
    const slow = fakePort()
    expect((await runDoseWatch(slow.port, Date.parse('2026-10-20T08:40:00+08:00'), { afterMin: 120 })).due).toBe(0)
  })
  it('a review medicine older than a day makes a review_open row at the next run, once per medicine per day (S4)', async () => {
    const f = fakePort({ meds: [review('2026-10-18')], taken: [took()] }) // the 08:00 dose was taken: only the review row is new
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ review: 1, failed: 0 })
    expect(f.rows.map((r) => [r.kind, r.carer, r.template, r.ref])).toEqual([['review_open', 'w1', 'review_open', 'm1:2026-10-20'], ['review_open', 'w2', 'review_open', 'm1:2026-10-20']])
    await runDoseWatch(f.port, NOW + 15 * 60_000)
    expect(f.rows).toHaveLength(2) // same ref: nothing more today
    await runDoseWatch(f.port, NOW + 24 * 3600_000)
    expect(f.rows.filter((r) => r.kind === 'review_open')).toHaveLength(4) // a new Manila day, a new row
  })
  it('no review_open when asked today, with no date, answered, or for an archived person', async () => {
    for (const m of [review('2026-10-20'), review(undefined), med(), review('2026-10-01', { people: { archived_at: '2026-10-19T00:00:00Z' } })]) {
      const f = fakePort({ meds: [m], taken: [took()] })
      await runDoseWatch(f.port, NOW)
      expect(f.rows.filter((r) => r.kind === 'review_open')).toHaveLength(0)
    }
  })
  it('a review medicine with no time on it still raises the question to the carers', async () => {
    const f = fakePort({ meds: [med({ schedule: { v: 1, times: [], needs_time: true, review: true, review_since: '2026-10-10' } })] })
    expect(await runDoseWatch(f.port, NOW)).toMatchObject({ due: 0, review: 1 })
  })
  it('digest: one row per carer for a person with an open dose, only in the first half hour of 20:00 Manila, once a day (Q15)', async () => {
    const evening = (hhmm: string) => Date.parse(`2026-10-20T${hhmm}:00+08:00`)
    const meds = [med(), med({ id: 'm2', person_id: 'p2' })]
    const taken = [took(), took({ person_id: 'p2', medication_id: 'm2' })] // both took the 08:00 dose
    const closed = fakePort({ meds, taken })
    await runDoseWatch(closed.port, evening('20:10'))
    expect(closed.rows).toHaveLength(0) // every compartment closed: no digest
    const open = fakePort({ meds, taken: [took({ person_id: 'p2', medication_id: 'm2' })] })
    await runDoseWatch(open.port, evening('19:59'))
    await runDoseWatch(open.port, evening('20:30'))
    expect(open.rows.filter((r) => r.kind === 'digest')).toHaveLength(0) // outside the window
    expect(await runDoseWatch(open.port, evening('20:05'))).toMatchObject({ digest: 1 })
    await runDoseWatch(open.port, evening('20:20'))
    expect(open.rows.filter((r) => r.kind === 'digest').map((r) => [r.personId, r.carer, r.template, r.ref])).toEqual([['p1', 'w1', 'digest', 'p1:2026-10-20'], ['p1', 'w2', 'digest', 'p1:2026-10-20']])
  })
  it('openToday lists people whose passed dose is still open, not a dose still to come', () => {
    expect(openToday([med(), med({ id: 'm3', person_id: 'p3', schedule: ['23:00'] })], [], NOW)).toEqual(['p1'])
    expect(openToday([med()], [took()], NOW)).toEqual([])
    expect(inDigestWindow(Date.parse('2026-10-20T20:29:00+08:00'))).toBe(true)
    expect(inDigestWindow(Date.parse('2026-10-20T20:30:00+08:00'))).toBe(false)
    expect(inDigestWindow(Date.parse('2026-10-20T12:05:00Z'))).toBe(true) // 20:05 Manila
  })
})

// ---- session 12, lane C (D-83): the 8 PM summary opt-out and vaccines
describe('digest opt-out (carer_prefs.digest_on)', () => {
  const EVE = Date.parse('2026-10-20T20:05:00+08:00') // 20:05 Manila: inside the digest window; the 19:00 dose is 65 min late (due) and still open
  const meds = [med({ schedule: { v: 1, times: ['19:00'] } })]
  const carers: Carer[] = [{ carer_id: 'J', person_id: 'p1', can_write: true }, { carer_id: 'B', person_id: 'p1', can_write: true }]
  const run = async (off: string[], over: { throws?: boolean } = {}) => {
    const f = fakePort({ meds, carers })
    f.port.digestOff = async (ids) => { if (over.throws) throw new Error('read'); return new Set(ids.filter((i) => off.includes(i))) }
    const report = await runDoseWatch(f.port, EVE)
    return { ...f, report }
  }
  it('carers J and B, B opted out: the digest goes to J only, the missed-dose alert still goes to both', async () => {
    const f = await run(['B'])
    expect(f.rows.filter((r) => r.kind === 'digest').map((r) => r.carer)).toEqual(['J']) // 1 digest row
    expect(f.rows.filter((r) => r.kind === 'dose_missed').map((r) => r.carer).sort()).toEqual(['B', 'J']) // 2 dose_missed rows
    expect(f.report).toMatchObject({ due: 1, rows: 1, digest: 1, failed: 0 })
  })
  it('nobody opted out: both carers get the digest', async () => {
    const f = await run([])
    expect(f.rows.filter((r) => r.kind === 'digest').map((r) => r.carer).sort()).toEqual(['B', 'J'])
  })
  it('both opted out: no digest at all (not counted), the missed-dose alerts are untouched', async () => {
    const f = await run(['B', 'J'])
    expect(f.rows.filter((r) => r.kind === 'digest')).toHaveLength(0)
    expect(f.rows.filter((r) => r.kind === 'dose_missed')).toHaveLength(2)
    expect(f.report.digest).toBe(0)
  })
  it('the opt-out is asked for the digest only, never for dose_missed or review_open', async () => {
    const f = fakePort({ meds: [med({ schedule: { v: 1, times: ['19:00'], review: true, review_since: '2026-10-10' } })], carers })
    const asked: string[][] = []
    f.port.digestOff = async (ids) => { asked.push(ids); return new Set(ids) } // everyone is off
    const report = await runDoseWatch(f.port, EVE)
    expect(asked).toEqual([['B', 'J']]) // exactly one question, for the one digest
    expect(f.rows.filter((r) => r.kind === 'review_open').map((r) => r.carer).sort()).toEqual(['B', 'J'])
    expect(f.rows.filter((r) => r.kind === 'dose_missed')).toHaveLength(2)
    expect(f.rows.filter((r) => r.kind === 'digest')).toHaveLength(0)
    expect(report).toMatchObject({ review: 1, digest: 0, failed: 0 })
  })
  it('a failed opt-out read skips the digest, counts a failure for the heartbeat, and still writes the missed-dose rows', async () => {
    const f = await run([], { throws: true })
    expect(f.rows.filter((r) => r.kind === 'digest')).toHaveLength(0)
    expect(f.rows.filter((r) => r.kind === 'dose_missed')).toHaveLength(2)
    expect(f.report).toMatchObject({ digest: 0, failed: 1 })
  })
  it('a port without digestOff (not wired yet) filters nobody', async () => {
    const f = fakePort({ meds, carers })
    await runDoseWatch(f.port, EVE)
    expect(f.rows.filter((r) => r.kind === 'digest')).toHaveLength(2)
  })
})

describe('isVaccine: a one-off shot is never watched', () => {
  it('reads real-looking vaccine names, and leaves ordinary medicines alone', () => {
    for (const name of ['PNEUMOCOCCAL POLYSACCHARIDE VACCINE', 'Influenza Vaccine 0.5 mL', 'Tetanus Toxoid 0.5 mL', 'PREVNAR 13', 'Hepatitis B vaccination', 'Shingrix 0.5 mL IM', 'PNEUMOCOCCAL POLYSACCHARIDE VACCINE, POLYVALENT', 'Bakuna sa trangkaso', 'Influenza vaccines 2026']) {
      expect(isVaccine({ name }), name).toBe(true)
    }
    for (const name of ['Losartan 50 mg', 'Metformin 500 mg tablet', 'Amlodipine 5 mg', 'Vitamin D3 1000 IU', 'Cefuroxime 500 mg', 'Omeprazole 20 mg capsule', 'Pneumonia relief syrup', 'Cranberry (Vaccinium macrocarpon) 500 mg', 'Bilberry Vaccinium myrtillus', 'Vaccinium extract 100 mg']) {
      expect(isVaccine({ name }), name).toBe(false)
    }
    expect(isVaccine({ name: 'Pneumovax 23' })).toBe(true)
    expect(isVaccine({ name: 'Brand X', generic_name: 'influenza vaccine' })).toBe(true)
    expect(isVaccine({ name: null })).toBe(false)
  })
  const vax = { name: 'PNEUMOCOCCAL POLYSACCHARIDE VACCINE', schedule: { v: 1, times: ['08:00'], review: true, review_since: '2026-10-10' } }
  it('a vaccine row raises no review_open and no dose_missed; the same row under an ordinary name does', async () => {
    const f = fakePort({ meds: [med(vax)] })
    expect(await runDoseWatch(f.port, NOW)).toEqual({ due: 0, claimed: 0, rows: 0, review: 0, digest: 0, failed: 0 })
    expect(f.rows).toHaveLength(0)
    const g = fakePort({ meds: [med({ ...vax, name: 'Losartan 50 mg' })] })
    expect(await runDoseWatch(g.port, NOW)).toMatchObject({ due: 1, review: 1 })
  })
  it('a vaccine never makes a person count as having an open dose for the 8 PM summary, and dueSlots skips it', () => {
    expect(openToday([med({ name: 'PNEUMOCOCCAL POLYSACCHARIDE VACCINE' })], [], NOW)).toEqual([])
    expect(dueSlots([med({ name: 'PNEUMOCOCCAL POLYSACCHARIDE VACCINE' })], [], NOW)).toEqual([])
  })
})
