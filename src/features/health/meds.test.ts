import { describe, expect, it } from 'vitest'
import type { Medication } from '../log/store'
import { dayOf, isLive, matchDoses, normaliseDrug, parseSchedule, pickSlot, remindable, reminderId, resolveMedication, reviewOverdue, slotsFor, toMinutes } from './meds'

const med = (o: Partial<Medication> & { name: string }): Medication => ({ personId: 'p1', medStatus: 'active', schedule: { v: 1, times: ['08:00'] }, serverId: `s-${o.name}`, ...o })
const DAY = '2026-10-20'
const iso = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00`).toISOString()

describe('parseSchedule', () => {
  it('reads v1', () => {
    expect(parseSchedule({ v: 1, times: ['20:00', '08:00', '08:00'], needs_time: false, needs_check: true, review: true, review_since: '2026-10-21' }))
      .toEqual({ times: ['08:00', '20:00'], needsTime: false, needsCheck: true, review: true, reviewSince: '2026-10-21' })
  })
  it('tolerates the legacy array form', () => {
    expect(parseSchedule(['08:00', '21:00']).times).toEqual(['08:00', '21:00'])
  })
  it('drops bad times and survives junk', () => {
    expect(parseSchedule({ v: 1, times: ['8am', '25:00', '07:60', '09:30', 5] }).times).toEqual(['09:30'])
    for (const j of [null, undefined, 'x', 3, {}, []]) expect(parseSchedule(j)).toEqual({ times: [], needsTime: false, needsCheck: false, review: false, reviewSince: null })
  })
  it('needs_time and review flags', () => {
    const s = parseSchedule({ v: 1, times: [], needs_time: true })
    expect(s.needsTime).toBe(true)
    expect(toMinutes('08:30')).toBe(510)
    expect(toMinutes('8:30')).toBeNull()
  })
})

describe('normaliseDrug (same rule as SQL normalise_drug)', () => {
  it('strips strength and form words, lower-cases', () => {
    expect(normaliseDrug('Drug A 500mg Tab')).toBe('drug a')
    expect(normaliseDrug('DRUG A 5 mg')).toBe('drug a')
    expect(normaliseDrug('Drug B 10 mg/ml syrup')).toBe('drug b')
    expect(normaliseDrug('drug-a capsules')).toBe('drug a')
    expect(normaliseDrug('  ')).toBeNull()
    expect(normaliseDrug('Losartán 50mg')).toBe('losart n') // non-ASCII letters are separators, as [^a-z0-9] in SQL
    expect(normaliseDrug('ñtab')).toBe('tab') // no word edge between ñ and tab (PG UTF-8 \\m), so the form word is not stripped
    expect(normaliseDrug('ñ tab')).toBeNull()
    expect(normaliseDrug(null)).toBeNull()
  })
})

describe('slotsFor', () => {
  it('lists the slots of active, timed medications of one person for the day, sorted', () => {
    const meds = [
      med({ name: 'Drug B', schedule: { v: 1, times: ['20:00', '08:00'] } }),
      med({ name: 'Drug A', schedule: ['07:00'] }),
      med({ name: 'Other', personId: 'p2' })
    ]
    expect(slotsFor(meds, 'p1', DAY).map((s) => [s.name, s.slot, s.at])).toEqual([['Drug A', '07:00', 420], ['Drug B', '08:00', 480], ['Drug B', '20:00', 1200]])
  })
  it('excludes paused, stopped, deleted, as-needed, needs-time and out-of-course rows', () => {
    const meds = [
      med({ name: 'Paused', medStatus: 'paused' }),
      med({ name: 'Stopped', medStatus: 'stopped' }),
      { ...med({ name: 'Deleted' }), deletedAt: '2026-10-01T00:00:00Z' } as Medication,
      med({ name: 'Prn', asNeeded: true }),
      med({ name: 'NoTime', schedule: { v: 1, times: [], needs_time: true } }),
      med({ name: 'NotYet', startedOn: '2026-10-21' }),
      med({ name: 'Over', stoppedOn: '2026-10-19' }),
      med({ name: 'Live' })
    ]
    expect(slotsFor(meds, 'p1', DAY).map((s) => s.name)).toEqual(['Live'])
    expect(isLive(meds[0]!)).toBe(false)
  })
})

describe('matchDoses', () => {
  const slots = () => slotsFor([med({ name: 'Drug A', schedule: { v: 1, times: ['08:00', '20:00'] } })], 'p1', DAY)
  it('matches by medicationId and slot', () => {
    const r = matchDoses(slots(), [{ name: 'Drug A', takenAt: iso('08:05'), medicationId: 's-Drug A', slot: '08:00' }], DAY)
    expect(r.map((d) => d.state)).toEqual(['taken', 'pending'])
  })
  it('a skipped row marks the slot skipped, and a real take wins over a skip', () => {
    const skip = { name: 'Drug A', takenAt: iso('20:05'), medicationId: 's-Drug A', slot: '20:00', skipped: true }
    expect(matchDoses(slots(), [skip], DAY).map((d) => d.state)).toEqual(['pending', 'skipped'])
    expect(matchDoses(slots(), [skip, { ...skip, skipped: false }], DAY).map((d) => d.state)).toEqual(['pending', 'taken'])
  })
  it('a take for another medication or another slot does not count', () => {
    const r = matchDoses(slots(), [{ name: 'Drug A', takenAt: iso('08:05'), medicationId: 'other', slot: '08:00' }, { name: 'Drug A', takenAt: iso('08:05'), medicationId: 's-Drug A', slot: '12:00' }], DAY)
    expect(r.map((d) => d.state)).toEqual(['pending', 'pending'])
  })
  it("yesterday's take does not count today", () => {
    expect(matchDoses(slots(), [{ name: 'Drug A', takenAt: iso('08:05', '2026-10-19'), medicationId: 's-Drug A', slot: '08:00' }], DAY)[0]!.state).toBe('pending')
  })
  it('an old row without medicationId falls back to a case-insensitive name match, one slot per take', () => {
    const r = matchDoses(slots(), [{ name: ' drug a ', takenAt: iso('08:05') }], DAY)
    expect(r.map((d) => d.state)).toEqual(['taken', 'pending'])
    expect(matchDoses(slots(), [{ name: 'Drug A', takenAt: iso('08:05'), skipped: true }], DAY).map((d) => d.state)).toEqual(['pending', 'pending'])
  })
  it('a row that has an id is never matched by name', () => {
    const r = matchDoses(slots(), [{ name: 'Drug A', takenAt: iso('08:05'), medicationId: 'other', slot: '08:00' }], DAY)
    expect(r[0]!.state).toBe('pending')
  })
})

describe('matchDoses name fallback', () => {
  it('matches an old "Losartan" take to a "Losartan 50mg tab" slot', () => {
    const slots = slotsFor([med({ name: 'Losartan 50mg tab', serverId: undefined })], 'p1', DAY)
    expect(matchDoses(slots, [{ name: 'Losartan', takenAt: iso('08:05') }], DAY)[0]!.state).toBe('taken')
    expect(matchDoses(slots, [{ name: 'LOSARTAN 50 mg', takenAt: iso('08:05') }], DAY)[0]!.state).toBe('taken')
    expect(matchDoses(slots, [{ name: 'Metformin', takenAt: iso('08:05') }], DAY)[0]!.state).toBe('pending')
  })
})

describe('reviewOverdue (D5)', () => {
  const m = (since: string | undefined, review = true) => ({ schedule: { v: 1, times: ['08:00'], review, ...(since ? { review_since: since } : {}) } })
  it('is false before review_since + 3 days and true ON and after it', () => {
    expect(reviewOverdue(m('2026-10-21'), '2026-10-23')).toBe(false)
    expect(reviewOverdue(m('2026-10-21'), '2026-10-24')).toBe(true) // pauses ON day 3
    expect(reviewOverdue(m('2026-10-21'), '2026-10-25')).toBe(true)
    expect(reviewOverdue(m('2026-10-21'), new Date(2026, 9, 25, 9, 0))).toBe(true)
  })
  it('compares dates in Asia/Manila, not UTC', () => {
    // 2026-10-23T17:00Z is already 2026-10-24 01:00 in Manila
    expect(reviewOverdue(m('2026-10-21'), new Date('2026-10-23T17:00:00Z'))).toBe(true)
    expect(reviewOverdue(m('2026-10-21'), new Date('2026-10-23T15:59:00Z'))).toBe(false) // 23:59 Manila on the 23rd
  })
  it('is false when answered, without a start date, or for a legacy array', () => {
    expect(reviewOverdue(m('2026-10-01', false), '2026-12-01')).toBe(false)
    expect(reviewOverdue(m(undefined), '2026-12-01')).toBe(false)
    expect(reviewOverdue({ schedule: ['08:00'] }, '2026-12-01')).toBe(false)
  })
})

describe('resolveMedication', () => {
  const meds = [med({ name: 'Drug A 50 mg tab' }), med({ name: 'Drug B', medStatus: 'stopped' }), med({ name: 'Drug C', personId: 'p2' })]
  it('matches the spoken name with strength and form words ignored', () => {
    expect(resolveMedication(meds, 'p1', 'drug a')?.name).toBe('Drug A 50 mg tab')
    expect(resolveMedication(meds, 'p1', 'Drug A 500mg Tablet')?.name).toBe('Drug A 50 mg tab')
  })
  it('does not match another person or an unknown name; stopped still resolves when it is the only match', () => {
    expect(resolveMedication(meds, 'p1', 'Drug C')).toBeUndefined()
    expect(resolveMedication(meds, 'p1', 'Nope')).toBeUndefined()
    expect(resolveMedication(meds, 'p1', 'Drug B')?.medStatus).toBe('stopped')
  })
  it('two live matches are not guessed', () => {
    expect(resolveMedication([med({ name: 'Drug A', serverId: '1' }), med({ name: 'Drug A 10 mg', serverId: '2' })], 'p1', 'drug a')).toBeUndefined()
  })
})

describe('pickSlot and remindable', () => {
  const twice = med({ name: 'Drug A', schedule: { v: 1, times: ['08:00', '20:00'] } })
  it('picks the latest open slot at or before now, never a future one; none before: the earliest', () => {
    expect(pickSlot(twice, [], new Date(`${DAY}T07:30:00`))).toBe('08:00') // nothing yet at or before: earliest
    expect(pickSlot(twice, [], new Date(`${DAY}T19:00:00`))).toBe('08:00') // 20:00 is still in the future
    expect(pickSlot(twice, [], new Date(`${DAY}T20:00:00`))).toBe('20:00')
    expect(pickSlot(twice, [], new Date(`${DAY}T21:30:00`))).toBe('20:00')
    expect(pickSlot(twice, [{ name: 'Drug A', takenAt: iso('08:05'), medicationId: 's-Drug A', slot: '08:00' }], new Date(`${DAY}T09:00:00`))).toBe('20:00') // only open slot left
  })
  it('gives none for as-needed or when every slot is done', () => {
    expect(pickSlot(med({ name: 'P', asNeeded: true }), [], new Date(`${DAY}T09:00:00`))).toBeUndefined()
    const done = ['08:00', '20:00'].map((slot) => ({ name: 'Drug A', takenAt: iso('09:00'), medicationId: 's-Drug A', slot }))
    expect(pickSlot(twice, done, new Date(`${DAY}T21:00:00`))).toBeUndefined()
  })
  it('remindable honours startedOn and stoppedOn like slotsFor', () => {
    const rows = [med({ name: 'NotYet', startedOn: '2026-10-21' }), med({ name: 'Over', stoppedOn: '2026-10-19' }), med({ name: 'Live', startedOn: '2026-10-20', stoppedOn: '2026-10-20' })]
    expect(remindable(rows, 'p1', DAY).map((m) => m.name)).toEqual(['Live'])
  })
  it('remindable drops paused, as-needed and overdue reviews', () => {
    const overdue = med({ name: 'Old', schedule: { v: 1, times: ['08:00'], review: true, review_since: '2026-10-01' } })
    const fresh = med({ name: 'Fresh', schedule: { v: 1, times: ['08:00'], review: true, review_since: '2026-10-19' } })
    expect(remindable([overdue, fresh, med({ name: 'P', medStatus: 'paused' }), med({ name: 'Prn', asNeeded: true })], 'p1', DAY).map((m) => m.name)).toEqual(['Fresh'])
  })
  it('dayOf is the local day', () => expect(dayOf(new Date(2026, 9, 20, 23, 59))).toBe('2026-10-20'))
})

describe('reminderId', () => {
  it('is deterministic and inside the int range, above the old 31000 block', () => {
    const a = reminderId('med-1', '08:00')
    expect(reminderId('med-1', '08:00')).toBe(a)
    expect(reminderId('med-1', '20:00')).not.toBe(a)
    for (let i = 0; i < 500; i++) { const id = reminderId(`m${i}`, '08:00'); expect(id).toBeGreaterThanOrEqual(100_000); expect(id).toBeLessThan(2_147_483_647) }
  })
})
