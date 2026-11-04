import { describe, expect, it } from 'vitest'
import type { AlertRow } from '../notify/store'
import { missedDoses, slotTime } from './missed'

const row = (id: string, o: Partial<AlertRow> = {}): AlertRow => ({ id, personId: 'ana', kind: 'dose_missed', template: 'dose_missed', ref: 'ana:2026-11-02:08:00', createdAt: '2026-11-02T01:00:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-09T00:00:00Z', ...o })
const NOW = new Date('2026-11-02T03:00:00Z') // 11 AM in Manila
describe('slotTime', () => {
  it('reads the dose slot off the ref', () => { expect(slotTime('ana:2026-11-02:08:00')).toBe('8:00 AM'); expect(slotTime('x:2026-11-02:13:05')).toBe('1:05 PM'); expect(slotTime('x:2026-11-02:00:30')).toBe('12:30 AM') })
  it('null when there is no slot', () => { expect(slotTime(null)).toBeNull(); expect(slotTime('ana')).toBeNull(); expect(slotTime('a:b:25:00')).toBeNull() })
})
describe('missedDoses', () => {
  it('one row per person, newest alert, unseen only, missed doses only', () => {
    const rows = [row('old', { createdAt: '2026-11-01T01:00:00Z', ref: 'ana:2026-11-02:07:00' }), row('new'), row('seen', { personId: 'ben', seenAt: '2026-11-02T02:00:00Z' }), row('sos', { personId: 'cy', kind: 'sos', template: 'family_sos' }), row('b2', { personId: 'dee', ref: null })]
    expect(missedDoses(rows, NOW)).toEqual([{ personId: 'ana', alertIds: ['new', 'old'], time: '8:00 AM' }, { personId: 'dee', alertIds: ['b2'], time: null }])
  })
  it('nobody missed -> empty', () => expect(missedDoses([], NOW)).toEqual([]))
  it('a miss from an earlier day is not a row today', () => expect(missedDoses([row('y', { ref: 'ana:2026-11-01:20:00' })], NOW)).toEqual([]))
})
