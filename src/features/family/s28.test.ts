import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isCheckup, kindsOn, rowsOn, MASKED_APPT, type CalSource } from './calendarLogic'
import { newestFirst } from './memoriesLogic'
import { cleanMessenger, messengerHref } from './messagesLogic'
import { needsRows } from './needsRows'
import { plannedTaskRings, ringsHere, TASK_ID_BASE, TASK_ID_SPAN } from './taskReminders'
import { cleanClock } from './tasks'
import type { FamilyTask } from './store'

const DAY = '2026-10-30'
const at = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).toISOString()
const src = (o: Partial<CalSource> = {}): CalSource => ({ events: [], tasks: [], notes: [], appts: [], doses: () => [], nameOf: (id) => ({ m: 'Mama Rosa' })[id ?? ''] ?? 'Family', ...o })

describe('Messenger name (migration 0061 and messengerHref use one rule)', () => {
  const sql = readFileSync('supabase/migrations/0061_family_messenger_reminder.sql', 'utf8')
  const rx = /messenger ~ '([^']+)'/.exec(sql)![1]!
  it('the SQL check and the client accept and refuse the same handles', () => {
    for (const [h, ok] of [['rosa.santos', true], ['abcde', true], ['abcd', false], ['a'.repeat(50), true], ['a'.repeat(51), false], ['rosa_santos', false], ['rosa santos', false], ['rosa-santos', false], ['', false]] as const) {
      expect(new RegExp(rx).test(h), `sql ${h}`).toBe(ok)
      expect(messengerHref(h) !== null, `client ${h}`).toBe(ok)
    }
  })
  it('0061 has a down file, the same column grant as phone, and no hard-coded names', () => {
    expect(sql).toContain('grant update (messenger) on public.people to authenticated')
    expect(readFileSync('supabase/migrations/0061_family_messenger_reminder.down.sql', 'utf8')).toContain('drop column if exists messenger')
    expect(sql).toContain("remind_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'")
  })
  it('cleanMessenger takes a typed name, an @name or a pasted m.me link', () => {
    expect(cleanMessenger('  @rosa.santos ')).toBe('rosa.santos')
    expect(cleanMessenger('https://m.me/rosa.santos/')).toBe('rosa.santos')
    expect(cleanMessenger('m.me/rosa.santos')).toBe('rosa.santos')
    expect(cleanMessenger('abc')).toBeNull()
    expect(cleanMessenger('')).toBeNull()
    expect(cleanMessenger('rosa santos')).toBeNull()
  })
  it('messengerHref builds the m.me link', () => expect(messengerHref('rosa.santos')).toEqual({ href: 'https://m.me/rosa.santos', label: 'Messenger' }))
})

describe('calendar markers', () => {
  it('a check-up or lab visit is its own kind; a plain doctor visit stays a visit', () => {
    expect(isCheckup({ purpose: 'Annual check-up' })).toBe(true)
    expect(isCheckup({ purpose: 'Dr. Reyes: blood tests' })).toBe(true)
    expect(isCheckup({ provider: 'City Lab' })).toBe(true)
    expect(isCheckup({ purpose: 'Eye doctor' })).toBe(false)
    expect(isCheckup({ purpose: 'Elaborate plan' })).toBe(false) // "lab" inside a word is not a lab
    const s = src({ appts: [{ personId: 'm', startsAt: at(DAY, 9), purpose: 'Check-up' }, { personId: 'm', startsAt: at(DAY, 11), purpose: 'Eye doctor' }] })
    expect(rowsOn(DAY, s, DAY).map((r) => r.kind)).toEqual(['checkup', 'visit'])
    expect(kindsOn(DAY, s, DAY)).toEqual(['checkup', 'visit']) // fixed order: dose, checkup, visit, ...
  })
  it('medicine shows as a dose marker', () => {
    expect(kindsOn(DAY, src({ doses: () => [{ personId: 'm', name: 'X', dose: null, slot: '08:00' }] }), DAY)).toEqual(['dose'])
  })
  it('D-173: another person\'s lab visit is masked and stays a plain Visit, so a marker says no more than the title', () => {
    const s = src({ masked: () => true, appts: [{ personId: 'm', startsAt: at(DAY, 9), purpose: 'Blood tests', provider: 'City Lab' }] })
    const r = rowsOn(DAY, s, DAY)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kind: 'visit', title: MASKED_APPT, masked: true })
    expect(JSON.stringify(r).replace(MASKED_APPT, '')).not.toMatch(/Blood|City|Lab/)
  })
})

describe('task reminder time', () => {
  const task = (o: Partial<FamilyTask> = {}): FamilyTask => ({ clientId: 't1', title: 'Pay bill', due: DAY, assigneePersonId: null, done: false, remindAt: '09:30', ...o })
  it('shows the time in the row and sorts the task at that time', () => {
    const r = rowsOn(DAY, src({ tasks: [task()] }), DAY)[0]!
    expect(r.sub).toMatch(/^Everyone · 9:30/)
    expect(r.sort).toBe('09:30')
  })
  it('no reminder time = the old row; overdue keeps the word Overdue', () => {
    expect(rowsOn(DAY, src({ tasks: [task({ remindAt: null })] }), DAY)[0]!.sub).toBe('Everyone')
    expect(rowsOn('2026-10-31', src({ tasks: [task()] }), '2026-10-31')[0]!.sub).toBe('Everyone · Overdue')
  })
  it('cleanClock accepts HH:MM only', () => {
    expect([cleanClock('09:30'), cleanClock('23:59'), cleanClock('24:00'), cleanClock('9:30'), cleanClock('09:60'), cleanClock(''), cleanClock(null)]).toEqual(['09:30', '23:59', null, null, null, null, null])
  })
  it('this phone rings only for someone in remindPeople AND with a healthy alarm plan; "Everyone" means the signed-in person', () => {
    expect(ringsHere('ma', 'me', ['me', 'ma'], true)).toBe(true)
    expect(ringsHere('ma', 'me', ['me'], true)).toBe(false) // not a person this phone rings for
    expect(ringsHere(null, 'me', ['me'], true)).toBe(true)
    expect(ringsHere(null, 'me', ['me'], false)).toBe(false) // alarm health not ok
    expect(ringsHere(null, null, [], true)).toBe(false)
  })
  it('plans one ring per open, future task with a day and a time, ids in the task range and apart', () => {
    const now = new Date(2026, 9, 30, 8, 0)
    const list = [task({ clientId: 'a' }), task({ clientId: 'b', remindAt: '07:00' }) /* past */, task({ clientId: 'c', done: true }), task({ clientId: 'd', remindAt: null }), task({ clientId: 'e', due: '2026-12-30' }) /* beyond 30 days */, task({ clientId: 'f', assigneePersonId: 'x' }) /* not rung here */]
    const plan = plannedTaskRings(list, 'me', ['me'], true, now)
    expect(plan.map((p) => p.clientId)).toEqual(['a'])
    expect(plan[0]!.at.getTime()).toBe(new Date(2026, 9, 30, 9, 30).getTime())
    expect(plan[0]!.id).toBeGreaterThanOrEqual(TASK_ID_BASE)
    expect(plan[0]!.id).toBeLessThan(TASK_ID_BASE + TASK_ID_SPAN)
    expect(plannedTaskRings(list, 'me', ['me'], false, now)).toEqual([]) // no healthy alarm plan, nothing is armed
    const many = Array.from({ length: 200 }, (_, i) => task({ clientId: `k${i}` }))
    expect(new Set(plannedTaskRings(many, 'me', ['me'], true, now).map((p) => p.id)).size).toBe(200)
  })
})

describe('Today merge: no duplicate person rows', () => {
  const p = { id: 'ma', name: 'Ma Villar', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false }
  const item = (kind: string) => ({ person: p, focus: { kind, line: 'Missed a medicine' }, asks: [], missedDoses: [{}] }) as never
  it('a missed medicine already on the person\'s card is not repeated in Needs; without a card line it stays', () => {
    expect(needsRows([item('missed')], [], [p], undefined, ['ma'])).toEqual([])
    expect(needsRows([item('missed')], [], [p], undefined, [])).toHaveLength(1)
    expect(needsRows([item('unwell')], [], [p], undefined, ['ma'])).toHaveLength(1) // the card shows a different line, so Needs keeps it
  })
})

describe('Memories order', () => {
  it('newest first by the day taken, else the day added', () => {
    const a = { id: 'a', takenOn: '2026-10-01', createdAt: '2026-11-01T10:00:00Z' }
    const b = { id: 'b', takenOn: null, createdAt: '2026-10-20T10:00:00Z' }
    const c = { id: 'c', takenOn: null, createdAt: '2026-10-20T12:00:00Z' }
    expect(newestFirst([a, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})
