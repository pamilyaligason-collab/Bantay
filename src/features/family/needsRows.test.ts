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

describe('needsRows', () => {
  it('never repeats what the person card already says', () => {
    expect(needsRows([item('questions', { asks: [ask] })], [], [joy])).toEqual([])
    expect(needsRows([item('missed', { missedDoses: [{ med: ask.med, slot: '08:00', time: '8:00 AM' }] })], [], [joy])).toEqual([])
  })
  it('lists questions behind a more urgent card', () => {
    const r = needsRows([item('missed', { asks: [ask, ask] })], [], [joy])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ title: 'Ate Joy: 2 questions', action: { kind: 'answer' } })
  })
  it('lists missed doses behind not feeling well', () => {
    expect(needsRows([item('unwell', { missedDoses: [{ med: ask.med, slot: '08:00', time: '8:00 AM' }] })], [], [joy])[0]).toMatchObject({ title: 'Ate Joy: missed a medicine' })
  })
  it('always lists a phone alert, once per person', () => {
    const r = needsRows([item('ok')], [phone('1', 'joy'), phone('2', 'joy')], [joy])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ title: "Ate Joy's phone may miss alarms", action: { kind: 'phone', alertId: '1' } })
  })
})
