import { describe, expect, it, vi } from 'vitest'

vi.mock('../../auth/client', () => ({ supabase: null }))

import {
  DOSE_CAP_DAYS, addDays, clock12, dayLabel, eventFields, eventInsert, expandDoses, manilaDay, manilaTime, monthGrid, parseTimesText, scheduleWithTimes, shiftMonth, taskInsert, toInstant, weekDays, withoutArchived, type MedRow
} from './scheduleApi'

const med = (o: Partial<MedRow> = {}): MedRow => ({ id: 'm1', person_id: 'p1', name: 'Test Medicine', strength: '5 mg', schedule: { v: 1, times: ['08:00', '20:00'] }, as_needed: false, med_status: 'active', deleted_at: null, status: 'confirmed', ...o })

describe('Manila days', () => {
  it('rolls an instant to the Manila day', () => {
    expect(manilaDay('2026-10-20T15:59:59Z')).toBe('2026-10-20')
    expect(manilaDay('2026-10-20T16:00:00Z')).toBe('2026-10-21')
    expect(manilaTime('2026-10-20T16:30:00Z')).toBe('00:30')
    expect(manilaDay('2026-10-21')).toBe('2026-10-21')
    expect(manilaDay('garbage')).toBe('')
  })
  it('builds instants from a day and a clock time, null when not real', () => {
    expect(toInstant('2026-10-21', '08:00')).toBe('2026-10-21T00:00:00.000Z')
    expect(toInstant('2026-10-21', null)).toBe('2026-10-20T16:00:00.000Z')
    expect(toInstant('2026-13-01', null)).toBeNull()
    expect(toInstant('2026-10-21', '24:00')).toBeNull()
  })
  it('labels days and clocks', () => {
    expect(dayLabel('2026-10-21', '2026-10-21')).toBe('Today')
    expect(dayLabel('2026-10-22', '2026-10-21')).toBe('Tomorrow')
    expect(dayLabel('2026-10-24', '2026-10-21')).toBe('Sat 24 Oct')
    expect(clock12('00:05')).toBe('12:05 AM')
    expect(clock12('15:30')).toBe('3:30 PM')
  })
})

describe('month grid', () => {
  it('starts on Monday and ends on Sunday with leading and trailing days', () => {
    const g = monthGrid('2026-10') // 1 Oct 2026 is a Thursday, 31 Oct a Saturday
    expect(g[0]).toBe('2026-09-28')
    expect(g[g.length - 1]).toBe('2026-11-01')
    expect(g).toHaveLength(35)
    expect(g.length % 7).toBe(0)
  })
  it('needs no padding when the month fills whole weeks, and can need six rows', () => {
    expect(monthGrid('2027-02')).toHaveLength(28) // 1 Feb 2027 is a Monday and 28 Feb a Sunday
    expect(monthGrid('2026-02')[0]).toBe('2026-01-26') // 1 Feb 2026 is a Sunday: six leading days
    expect(monthGrid('2026-08')).toHaveLength(42) // 1 Aug 2026 is a Saturday, 31 Aug a Monday
  })
  it('shifts months across year ends and lists a week', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(weekDays('2026-10-21')[0]).toBe('2026-10-19')
    expect(weekDays('2026-10-25')[6]).toBe('2026-10-25')
  })
})

describe('dose expansion', () => {
  it('makes one dose per time per day', () => {
    const { items, capped } = expandDoses([med()], '2026-10-19', '2026-10-21')
    expect(items).toHaveLength(6)
    expect(capped).toBe(false)
    expect(items[0]).toMatchObject({ kind: 'dose', when: '2026-10-19T08:00:00+08:00', allDay: false, title: 'Test Medicine 5 mg', personId: 'p1', rowId: 'm1' })
    expect(manilaDay(items[1].when)).toBe('2026-10-19')
  })
  it('skips paused, stopped, deleted, as-needed and rejected medicines', () => {
    const rows = [med({ id: 'a', med_status: 'paused' }), med({ id: 'b', med_status: 'stopped' }), med({ id: 'c', deleted_at: '2026-10-01T00:00:00Z' }), med({ id: 'd', as_needed: true }), med({ id: 'e', status: 'rejected' })]
    expect(expandDoses(rows, '2026-10-19', '2026-10-25').items).toHaveLength(0)
  })
  it('skips medicines with no usable times (never guessed) and accepts the legacy array', () => {
    expect(expandDoses([med({ schedule: { v: 1, times: [], needs_time: true } })], '2026-10-19', '2026-10-19').items).toHaveLength(0)
    expect(expandDoses([med({ schedule: ['09:00', 'bad'] })], '2026-10-19', '2026-10-19').items).toHaveLength(1)
  })
  it('caps the range at 14 days and says so', () => {
    const r = expandDoses([med({ schedule: { v: 1, times: ['08:00'] } })], '2026-10-01', '2026-10-31')
    expect(r.items).toHaveLength(DOSE_CAP_DAYS)
    expect(r.capped).toBe(true)
    expect(manilaDay(r.items[DOSE_CAP_DAYS - 1].when)).toBe(addDays('2026-10-01', 13))
    expect(expandDoses([med()], '2026-10-01', addDays('2026-10-01', 13)).capped).toBe(false)
  })
})

describe('write payloads', () => {
  it('inserts an event with exactly the table columns, created_by and a client id', () => {
    const row = eventInsert({ title: ' Dentist ', date: '2026-10-21', allDay: false, start: '09:00', end: '10:00', personId: 'p1' }, 'u-1', 'c-1')!
    expect(Object.keys(row).sort()).toEqual(['all_day', 'client_id', 'created_by', 'ends_at', 'person_id', 'starts_at', 'title'])
    expect(row).toMatchObject({ client_id: 'c-1', created_by: 'u-1', title: 'Dentist', all_day: false, person_id: 'p1', starts_at: '2026-10-21T01:00:00.000Z', ends_at: '2026-10-21T02:00:00.000Z' })
  })
  it('makes an all-day event at Manila midnight with no end and a family-wide owner', () => {
    expect(eventInsert({ title: 'Birthday', date: '2026-10-21', allDay: true, start: '09:00', end: '10:00' }, 'u-1')).toMatchObject({ all_day: true, starts_at: '2026-10-20T16:00:00.000Z', ends_at: null, person_id: null })
  })
  it('generates a client id when none is given', () => {
    expect(eventInsert({ title: 'x', date: '2026-10-21', allDay: true }, 'u')!.client_id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('refuses a missing title, a bad date and a timed event with no start; drops an end before the start', () => {
    expect(eventFields({ title: '  ', date: '2026-10-21', allDay: true })).toBeNull()
    expect(eventFields({ title: 'x', date: '2026-02-30x', allDay: true })).toBeNull()
    expect(eventFields({ title: 'x', date: '2026-10-21', allDay: false, start: null })).toBeNull()
    expect(eventFields({ title: 'x', date: '2026-10-21', allDay: false, start: '10:00', end: '09:00' })!.ends_at).toBeNull()
  })
  it('inserts a task with only its columns', () => {
    const row = taskInsert({ title: 'Buy test strips', due: '2026-10-23', assigneePersonId: 'p2' }, 'u-1', 'c-2')!
    expect(row).toEqual({ client_id: 'c-2', title: 'Buy test strips', due: '2026-10-23', assignee_person_id: 'p2', done: false, created_by: 'u-1' })
    expect(taskInsert({ title: 'x', due: 'soon' }, 'u')).toBeNull()
    expect(taskInsert({ title: 'x' }, 'u')).toMatchObject({ due: null, assignee_person_id: null })
  })
})

describe('medicine time editing', () => {
  it('validates HH:MM, sorts and removes duplicates', () => {
    expect(parseTimesText('20:00, 08:00 08:00')).toEqual(['08:00', '20:00'])
    expect(parseTimesText('')).toEqual([])
    expect(parseTimesText('8am')).toBeNull()
    expect(parseTimesText('08:00, 25:00')).toBeNull()
    expect(parseTimesText('8:00')).toBeNull()
  })
  it('keeps the schedule shape and unrelated keys, drops needs_time once times exist', () => {
    expect(scheduleWithTimes({ v: 1, times: ['08:00'], review_since: '2026-10-01', needs_time: true }, ['09:00'])).toEqual({ v: 1, times: ['09:00'], review_since: '2026-10-01' })
    expect(scheduleWithTimes(['08:00'], ['07:00'])).toEqual({ v: 1, times: ['07:00'] })
    expect(scheduleWithTimes(null, [])).toEqual({ v: 1, times: [] })
    expect(scheduleWithTimes({ v: 1, needs_time: true }, [])).toEqual({ v: 1, needs_time: true, times: [] })
  })
})

describe('archived people', () => {
  const gone = new Set(['p9'])
  it('doses of an archived person are left out, others stay', () => {
    const meds = withoutArchived([med(), med({ id: 'm2', person_id: 'p9' })], gone)
    expect(meds.map((m) => m.id)).toEqual(['m1'])
    expect(expandDoses(meds, '2026-10-21', '2026-10-21').items.every((i) => i.personId === 'p1')).toBe(true)
  })
  it('agenda items drop by personId; no person or an empty set keeps everything', () => {
    const items = [{ personId: 'p9' }, { personId: 'p1' }, { personId: null }]
    expect(withoutArchived(items, gone)).toEqual([{ personId: 'p1' }, { personId: null }])
    expect(withoutArchived(items, new Set())).toBe(items)
  })
})
