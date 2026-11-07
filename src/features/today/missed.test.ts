import { describe, expect, it } from 'vitest'
import type { AlertRow } from '../notify/store'
import { DOSE_RETRY_MS } from '../../../supabase/functions/dose-watch/logic'
import { MISSED_QUIET_MS, missedDoses, slotTime } from './missed'

const row = (id: string, o: Partial<AlertRow> = {}): AlertRow => ({ id, personId: 'ana', kind: 'dose_missed', template: 'dose_missed', ref: 'ana:2026-11-02:08:00', createdAt: '2026-11-02T02:50:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-09T00:00:00Z', ...o })
const NOW = new Date('2026-11-02T03:00:00Z') // 11 AM in Manila
describe('slotTime', () => {
  it('reads the dose slot off the ref', () => { expect(slotTime('ana:2026-11-02:08:00')).toBe('8:00 AM'); expect(slotTime('x:2026-11-02:13:05')).toBe('1:05 PM'); expect(slotTime('x:2026-11-02:00:30')).toBe('12:30 AM') })
  it('null when there is no slot', () => { expect(slotTime(null)).toBeNull(); expect(slotTime('ana')).toBeNull(); expect(slotTime('a:b:25:00')).toBeNull() })
})
describe('missedDoses', () => {
  it('one row per person, newest alert, unseen only, missed doses only', () => {
    const rows = [row('old', { createdAt: '2026-11-02T02:40:00Z', ref: 'ana:2026-11-02:07:00' }), row('new'), row('seen', { personId: 'ben', seenAt: '2026-11-02T02:00:00Z' }), row('sos', { personId: 'cy', kind: 'sos', template: 'family_sos' }), row('b2', { personId: 'dee', ref: null })]
    expect(missedDoses(rows, NOW)).toEqual([{ personId: 'ana', alertIds: ['new', 'old'], time: '8:00 AM', quiet: false }, { personId: 'dee', alertIds: ['b2'], time: null, quiet: false }])
  })
  it('nobody missed -> empty', () => expect(missedDoses([], NOW)).toEqual([]))
  it('a miss from an earlier day is not a row today', () => expect(missedDoses([row('y', { ref: 'ana:2026-11-01:20:00' })], NOW)).toEqual([]))
})
describe('D-145 quiet is per dose (time since its newest alert), and final', () => {
  const dose = (id: string, slot = '08:00', o: Partial<AlertRow> = {}) => row(id, { ref: `ana:2026-11-02:${slot}`, ...o })
  const spent = (id: string, slot = '08:00') => dose(id, slot, { createdAt: '2026-11-02T02:25:00Z' }) // 35 min before NOW
  it('a dose is quiet exactly MISSED_QUIET_MS after its newest alert; 29 min is still loud', () => {
    expect(MISSED_QUIET_MS).toBe(30 * 60_000)
    expect(missedDoses([dose('a', '08:00', { createdAt: '2026-11-02T02:31:00Z' })], NOW)).toEqual([{ personId: 'ana', alertIds: ['a'], time: '8:00 AM', quiet: false }])
    expect(missedDoses([dose('a', '08:00', { createdAt: '2026-11-02T02:30:00Z' })], NOW)).toEqual([{ personId: 'ana', alertIds: ['a'], time: '8:00 AM', quiet: true }])
  })
  it('a re-raised dose is judged by its newest alert (seen ones count too)', () => {
    const old = dose('a', '08:00', { createdAt: '2026-11-02T01:00:00Z', seenAt: '2026-11-02T01:05:00Z' })
    expect(missedDoses([old, dose('b')], NOW)).toEqual([{ personId: 'ana', alertIds: ['b'], time: '8:00 AM', quiet: false }])
    expect(missedDoses([old, spent('b')], NOW)).toEqual([{ personId: 'ana', alertIds: ['b'], time: '8:00 AM', quiet: true }])
  })
  it('4 different doses the same day, all fresh, are all loud: a person with many misses is never silenced as a whole', () => {
    const out = missedDoses(['06:00', '07:00', '08:00', '09:00'].map((sl) => dose(`d${sl}`, sl)), NOW)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ quiet: false, alertIds: expect.arrayContaining(['d06:00', 'd07:00', 'd08:00', 'd09:00']) })
  })
  it('one spent dose beside one fresh dose of the same person: two entries, only the spent dose folds', () => {
    const out = missedDoses([spent('a'), dose('x', '09:00')], NOW)
    expect(out).toEqual([{ personId: 'ana', alertIds: ['x'], time: '9:00 AM', quiet: false }, { personId: 'ana', alertIds: ['a'], time: '8:00 AM', quiet: true }])
  })
  it('a spent dose of one person folds; a second person with a fresh alert is untouched', () => {
    const out = missedDoses([spent('a'), row('z', { personId: 'ben', ref: 'ben:2026-11-02:08:00' })], NOW)
    expect(out.find((m) => m.personId === 'ana')).toMatchObject({ quiet: true })
    expect(out.find((m) => m.personId === 'ben')).toMatchObject({ quiet: false, alertIds: ['z'] })
  })
  it('a dose that is already final (taken or skipped) is no row, and no row when every alert of the person is final', () => {
    expect(missedDoses([spent('a'), dose('c', '09:00')], NOW, new Set(['c']))).toEqual([{ personId: 'ana', alertIds: ['a'], time: '8:00 AM', quiet: true }])
    expect(missedDoses([row('c')], NOW, new Set(['c']))).toEqual([])
  })
  it.each([['23:30 Manila', '2026-11-02T15:30:00Z'], ['00:30 Manila the next day', '2026-11-02T16:30:00Z']])('the Manila day decides what is today at %s', (_l, at) => {
    const t = new Date(at)
    const today = at.startsWith('2026-11-02T16') ? '2026-11-03' : '2026-11-02'
    const rows = [row('t', { ref: `ana:${today}:08:00` }), row('o', { personId: 'ben', ref: `ben:${today === '2026-11-03' ? '2026-11-02' : '2026-11-03'}:08:00` })]
    expect(missedDoses(rows, t).map((m) => m.personId)).toEqual(['ana'])
  })
})

describe('D-145 shared constant and unknown age', () => {
  it('MISSED_QUIET_MS is the server DOSE_RETRY_MS (one constant, 30 minutes), so the two cannot drift', () => {
    expect(MISSED_QUIET_MS).toBe(DOSE_RETRY_MS)
    expect(DOSE_RETRY_MS).toBe(30 * 60_000)
  })
  it('an unparseable createdAt counts as fresh (loud), never as old (quiet)', () => {
    const bad = row('bad', { createdAt: 'not a date', ref: 'ana:2026-11-02:08:00' })
    expect(missedDoses([bad], NOW)).toEqual([{ personId: 'ana', alertIds: ['bad'], time: '8:00 AM', quiet: false }])
    expect(missedDoses([bad, row('good', { createdAt: '2026-11-02T02:00:00Z' })], NOW)).toEqual([{ personId: 'ana', alertIds: ['bad', 'good'], time: '8:00 AM', quiet: false }])
  })
})
