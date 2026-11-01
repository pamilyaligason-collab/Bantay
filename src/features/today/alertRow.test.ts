import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { agoShort, quakeRow } from './alertRow'
const now = Date.parse('2026-10-31T20:00:00+08:00')
const q = (level: string, extra: Partial<Alert> = {}) => ({ id: 'q', kind: 'quake', level, title: 'Earthquake', what: '', where: 'Tago', doNow: '', source: 'USGS', issuedAt: new Date(now - 11 * 3600_000).toISOString(), ...extra }) as Alert
const who = (km: number | null) => ({ affects: true, km, line: '', steps: true })
describe('quakeRow', () => {
  it('M4.6 at 272 km is too far to feel', () => {
    expect(quakeRow(q('Magnitude 4.6'), who(272), now)).toEqual({ title: 'Earthquake M4.6 near Tago', sub: '272 km away · too far to feel here · 11 h ago' })
  })
  it('M6.0 at 272 km is inside its radius: red card', () => expect(quakeRow(q('Magnitude 6.0'), who(272), now)).toBeNull())
  it('a tsunami-size quake never becomes the quiet row', () => expect(quakeRow(q('Magnitude 6.8'), who(450), now)).toBeNull())
  it('area-wide and non-quake are never a row', () => {
    expect(quakeRow(q('Magnitude 4.6'), who(null), now)).toBeNull()
    expect(quakeRow(q('Orange', { kind: 'gdacs' }), who(900), now)).toBeNull()
  })
  it('agoShort', () => { expect(agoShort(now - 5 * 60_000, now)).toBe('5 min ago'); expect(agoShort(now - 26 * 3600_000, now)).toBe('1 d ago') })
})
