import { describe, expect, it } from 'vitest'
import type { Medication } from '../log/store'
import { personFocus, sortByFocus, type FocusData } from './personFocus'
import type { DoseLine } from '../family/MemberPage'
import type { FamilyPerson } from './roster'

const now = new Date('2026-10-27T10:20:00+08:00')
const joy = { id: 'joy', name: 'Ate Joy', isMe: false, phone: '0917 111 2222' }
const dose = (time: string, slot: string, word: DoseLine['word'] = 'Missed'): DoseLine => ({ key: `m|${slot}`, name: 'Nasal spray', time, word, state: 'missed' })
const base: FocusData = { unwell: false, missed: [], due: [], later: 0, asks: [], checkIn: undefined, canMark: true, now }
const ask = (days: number): { person: FamilyPerson; med: Medication; days: number } => ({ person: joy as FamilyPerson, med: { name: 'Cefixime' } as Medication, days })

describe('personFocus', () => {
  it('unwell beats everything and calls when there is a phone', () => {
    const f = personFocus(joy, { ...base, unwell: true, missed: [dose('8:00 AM', '08:00')] })
    expect(f).toMatchObject({ kind: 'unwell', tint: 'red', line: 'Not feeling well', action: { kind: 'call' } })
    expect(personFocus({ ...joy, phone: null }, { ...base, unwell: true }).action?.kind).toBe('message')
  })
  it('one missed dose is red with Mark taken and the age of the dose', () => {
    const f = personFocus(joy, { ...base, missed: [dose('8:00 AM', '08:00')], later: 2 })
    expect(f).toMatchObject({ kind: 'missed', tint: 'red', line: 'Missed a medicine', action: { label: 'Mark taken', kind: 'mark' } })
    expect(f.body).toContain('was due 8:00 AM, 2 h 20 min ago')
    expect(f.body).toContain('2 other doses not marked yet')
  })
  it('two missed doses say how many', () => {
    expect(personFocus(joy, { ...base, missed: [dose('8:00 AM', '08:00'), dose('9:00 AM', '09:00')] }).line).toBe('Missed 2 medicines')
  })
  it('never offers Mark taken when canMark is false (acting, not a carer) or for yourself', () => {
    expect(personFocus(joy, { ...base, canMark: false, missed: [dose('8:00 AM', '08:00')] }).action?.kind).toBe('open')
    expect(personFocus({ ...joy, isMe: true }, { ...base, missed: [dose('8:00 AM', '08:00')] }).action?.kind).toBe('open')
  })
  it('questions waiting: amber, Answer, count and age', () => {
    const f = personFocus(joy, { ...base, asks: [ask(11), ask(3), ask(2), ask(2), ask(1)] })
    expect(f).toMatchObject({ kind: 'questions', tint: 'amber', line: '5 questions waiting', action: { kind: 'answer' } })
    expect(f.body).toBe('"Still taking Cefixime?" and 4 more, asked 11 days ago.')
    expect(personFocus(joy, { ...base, asks: [ask(1)] }).body).toBe('"Still taking Cefixime?" asked yesterday.')
  })
  it('a dose due now counts the medicines at that time', () => {
    const f = personFocus(joy, { ...base, due: [dose('10:00 AM', '10:00'), dose('10:00 AM', '10:00')] })
    expect(f).toMatchObject({ kind: 'due', line: '2 medicines at 10:00 AM' })
  })
  it('no check-in today is neutral; a check-in today is OK', () => {
    expect(personFocus(joy, base)).toMatchObject({ kind: 'nocheck', tint: 'none', line: 'No check-in today', action: { kind: 'message' } })
    expect(personFocus(joy, { ...base, checkIn: '2026-10-27T07:40:00+08:00' })).toMatchObject({ kind: 'ok', body: 'Nothing waiting.' })
    expect(personFocus({ ...joy, isMe: true }, base).action?.kind).toBe('open')
  })
})

describe('sortByFocus', () => {
  it('red first, then amber, then the rest, ties in roster order', () => {
    const c = (id: string, tint: 'red' | 'amber' | 'none') => ({ id, focus: { tint } })
    expect(sortByFocus([c('a', 'none'), c('b', 'red'), c('c', 'amber'), c('d', 'none')]).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})
