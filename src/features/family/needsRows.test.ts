import { describe, expect, it } from 'vitest'
import type { Medication } from '../log/store'
import type { AlertRow } from '../notify/store'
import { needsRows } from './needsRows'
import type { PersonFocus } from './useFocuses'
import type { FamilyPerson } from './roster'

const person = (id: string, name: string) => ({ id, name, isMe: false, phone: null, photoPath: null, thumb: null, birthdate: null }) as FamilyPerson
const joy = person('joy', 'Ate Joy')
const ask = { person: joy, med: { name: 'Ibuprofen' } as Medication, days: 11 }
const item = (kind: string, extra: Partial<PersonFocus> = {}): PersonFocus => ({ person: joy, focus: { kind } as PersonFocus['focus'], missedDoses: [], asks: [], alertIds: [], ...extra })
const phone = (id: string, personId: string): AlertRow => ({ id, personId, kind: 'phone_health', template: 'phone_health', ref: null, createdAt: '', seenAt: null } as unknown as AlertRow)

const dose = { med: ask.med, slot: '08:00', time: '8:00 AM' }

describe('needsRows', () => {
  it('lists a missed dose for a carer with no medicine name and no number, even when the card is on show (D-109)', () => {
    for (const kind of ['missed', 'ok', 'unwell']) {
      const r = needsRows([item(kind, { missedDoses: [dose, dose] })], [], [joy], 'joy')
      expect(r).toHaveLength(1)
      expect(r[0]).toMatchObject({ title: 'Ate Joy: missed a medicine', sub: 'Open to see which one', action: { kind: 'select', personId: 'joy' } })
      expect(JSON.stringify(r)).not.toMatch(/Ibuprofen|Nasal|2 doses|8:00/)
    }
  })
  it('never lists your own missed doses (you are not your own carer)', () => {
    expect(needsRows([item('missed', { person: { ...joy, isMe: true }, missedDoses: [dose] })], [], [joy])).toEqual([])
  })
  it('a question row drops the medicine name and says how long ago', () => {
    const r = needsRows([item('missed', { asks: [ask, ask] })], [], [joy])
    expect(r[0]).toMatchObject({ title: 'Ate Joy: 2 questions', sub: 'Asked 11 days ago', action: { kind: 'answer' } })
    expect(JSON.stringify(r[0]!.sub)).not.toContain('Ibuprofen')
    expect(needsRows([item('ok', { asks: [{ ...ask, days: 1 }] })], [], [joy])[0]!.sub).toBe('Asked yesterday')
  })
  it('a question the card on show already says is not repeated; for anyone not on show it is listed', () => {
    expect(needsRows([item('questions', { asks: [ask] })], [], [joy], 'joy')).toEqual([])
    expect(needsRows([item('questions', { asks: [ask] })], [], [joy], 'someone-else')).toHaveLength(1)
  })
  it('always lists a phone alert, once per person', () => {
    const r = needsRows([item('ok')], [phone('1', 'joy'), phone('2', 'joy')], [joy])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ title: "Ate Joy's phone may miss alarms", action: { kind: 'phone', alertId: '1' } })
  })
})
