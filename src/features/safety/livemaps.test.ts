import { describe, expect, it } from 'vitest'
import type { Alert } from './alerts'
import { cyclones, windySrc } from './LiveMaps'

const a = (id: string, kind: Alert['kind'], issuedAt: string) => ({ id, kind, issuedAt, title: id, where: 'X, Philippines', level: 'Orange' }) as Alert

describe('windySrc', () => {
  it('sets overlay and rounds the position', () => {
    const u = windySrc('wind', 9.6512, 123.884, 8)
    expect(u).toContain('overlay=wind')
    expect(u).toContain('lat=9.65&lon=123.88&detailLat=9.65&detailLon=123.88')
    expect(u).toContain('zoom=8')
    expect(u.startsWith('https://embed.windy.com/embed.html?type=map')).toBe(true)
  })
})
describe('cyclones', () => {
  it('keeps only GDACS tropical cyclones, newest first', () => {
    const out = cyclones([a('gdacs-VO-1', 'gdacs', '2026-10-17'), a('gdacs-TC-1', 'gdacs', '2026-10-15'), a('gdacs-TC-2', 'gdacs', '2026-10-16'), a('gdacs-TC-3', 'quake', '2026-10-18')])
    expect(out.map((x) => x.id)).toEqual(['gdacs-TC-2', 'gdacs-TC-1'])
  })
})
