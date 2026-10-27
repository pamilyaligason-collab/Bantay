import { describe, expect, it } from 'vitest'
import { ALERT_RADIUS_KM } from '../today/heroCards'
import { affectsUs, quakeFeltKm, type Alert, diffBulletin, distanceKm, freshness, freshText, hazardOf, HOME, newestChecked, outdatedLine, placeLabel, plainWhat, rankAlerts, SOURCES_LINE, tierOf } from './alerts'

const a = (id: string, kind: Alert['kind'], over: Partial<Alert> = {}): Alert => ({
  id, kind, level: null, title: id, what: '', where: '', when: '', doNow: '', source: '', sourceUrl: null,
  issuedAt: '2026-10-17T00:00:00Z', lat: null, lon: null, bulletin: '', ...over
})

describe('rankAlerts', () => {
  it('orders by priority tier', () => {
    const out = rankAlerts([a('g', 'gdacs'), a('l', 'local'), a('u', 'utility'), a('q', 'quake'), a('h', 'heat'), a('t', 'tcws')], null)
    expect(out.map((x) => x.id)).toEqual(['h', 't', 'q', 'u', 'l', 'g'])
  })
  it('volcano ranks with PHIVOLCS (tier 1), air quality below it with utilities (tier 2, never above an official warning)', () => {
    const out = rankAlerts([a('air', 'air'), a('v', 'volcano'), a('u', 'utility', { issuedAt: '2026-10-16T00:00:00Z' }), a('q', 'quake', { lat: 9.7, lon: 123.9 }), a('t', 'tcws')], null)
    expect(out.map((x) => x.id)).toEqual(['t', 'v', 'q', 'air', 'u'])
    expect(tierOf('volcano')).toBe(tierOf('quake'))
    expect(tierOf('air')).toBeGreaterThan(tierOf('tcws'))
  })
  it('volcano and air have no practice card', () => {
    expect(hazardOf('volcano')).toBeNull()
    expect(hazardOf('air')).toBeNull()
    expect(hazardOf('quake')).toBe('earthquake')
  })
  it('within a tier, nearest to the given location first', () => {
    const near = a('near', 'quake', { lat: 9.7, lon: 123.9 })
    const far = a('far', 'quake', { lat: 7.0, lon: 125.0 })
    expect(rankAlerts([far, near], null).map((x) => x.id)).toEqual(['near', 'far'])
    // from Davao-ish, the far one is nearer
    expect(rankAlerts([near, far], { lat: 7.05, lon: 125.05 }).map((x) => x.id)).toEqual(['far', 'near'])
  })
  it('with no location, a Conel-side alert is as near as a Dampas-side one (nearest of the two zones)', () => {
    const conel = a('conel', 'quake', { lat: 6.25, lon: 125.19 }) // about 5 km from Conel
    const dampas = a('dampas', 'quake', { lat: 9.70, lon: 123.90 }) // about 6 km from Dampas
    const mid = a('mid', 'quake', { lat: 8.0, lon: 124.5 }) // 150+ km from both
    expect(rankAlerts([mid, dampas, conel], null).map((x) => x.id)).toEqual(['conel', 'dampas', 'mid'])
  })
  it('ties go to the newest, and input is not mutated', () => {
    const old = a('old', 'heat', { issuedAt: '2026-10-16T00:00:00Z' })
    const nu = a('new', 'heat')
    const input = [old, nu]
    expect(rankAlerts(input, null).map((x) => x.id)).toEqual(['new', 'old'])
    expect(input[0].id).toBe('old')
  })
})

describe('diffBulletin', () => {
  it('returns null with no previous version', () => {
    expect(diffBulletin(null, 'Signal No. 2.')).toBeNull()
  })
  it('lists added and removed sentences', () => {
    const d = diffBulletin('Signal No. 1. Winds 40 kph.', 'Signal No. 2. Winds 40 kph.')
    expect(d).toEqual({ added: ['Signal No. 2.'], removed: ['Signal No. 1.'] })
  })
})

it('distanceKm is zero at the same point and about 111 km per degree of latitude', () => {
  expect(distanceKm(HOME, HOME)).toBe(0)
  expect(distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.2, 0)
})

const NOW = Date.parse('2026-10-27T06:00:00Z')
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()

describe('freshness', () => {
  it('59 min is ok, 60 is ok, 61 is amber, over a day is red', () => {
    expect(freshness(minAgo(59), NOW)).toEqual({ ageMin: 59, tone: 'ok' })
    expect(freshness(minAgo(60), NOW).tone).toBe('ok')
    expect(freshness(minAgo(61), NOW)).toEqual({ ageMin: 61, tone: 'amber' })
    expect(freshness(minAgo(24 * 60 + 1), NOW).tone).toBe('red')
  })
  it('null or unreadable is never checked, not fresh (ML-05)', () => {
    for (const v of [null, undefined, '', 'soon']) {
      expect(freshness(v, NOW)).toEqual({ ageMin: null, tone: 'red' })
      expect(freshText(freshness(v, NOW))).toBe('Never checked')
    }
  })
  it('says the age in plain words and a future time is "just now"', () => {
    expect(freshText(freshness(minAgo(5), NOW))).toBe('Checked 5 min ago')
    expect(freshText(freshness(minAgo(0), NOW))).toBe('Checked just now')
    expect(freshText(freshness(minAgo(-3), NOW))).toBe('Checked just now')
    expect(freshText(freshness(minAgo(180), NOW))).toBe('Checked 3 h ago')
    expect(freshText(freshness(minAgo(10 * 24 * 60), NOW))).toBe('Checked 10 days ago')
  })
  it('newestChecked ignores rows with no or bad time', () => {
    expect(newestChecked([a('x', 'quake', { checkedAt: minAgo(30) }), a('y', 'quake', { checkedAt: minAgo(5) }), a('z', 'quake', { checkedAt: 'bad' }), a('w', 'quake')])).toBe(minAgo(5))
    expect(newestChecked([])).toBeNull()
  })
  it('the amber line names the time (Manila) and the radio', () => {
    const t = outdatedLine('2026-10-27T06:00:00Z')
    expect(t).toMatch(/^Alerts last checked .*2026.*\. They may be out of date\. Check PAGASA or listen to the radio\.$/)
    expect(t).toContain('2:00') // 06:00 UTC is 2:00 pm in Manila
    expect(outdatedLine(null)).toMatch(/not been checked on this phone yet\. They may be out of date\./)
  })
})

describe('affectsUs', () => {
  // Hand-computed: 0.8 degrees of latitude = 0.8 * pi/180 * 6371 km = 88.95 km, so a quake 0.8 deg north of Conel (6.2015121, 125.1878084) is 89 km away.
  const conel = { lat: 6.2015121, lon: 125.1878084 }
  const q89 = a('q89', 'quake', { level: 'Magnitude 4.5', lat: conel.lat + 0.8, lon: conel.lon })
  it('an 89 km M4.5 quake is near home: M4 to 5 is felt to 100 km, and the steps show', () => {
    expect(Math.round(distanceKm(conel, { lat: q89.lat!, lon: q89.lon! }))).toBe(89)
    expect(affectsUs(q89, conel)).toEqual({ affects: true, km: 89, line: 'Near you. Follow the steps below.', steps: true })
  })
  it('an 89 km M3.0 quake is probably too far to feel, and the steps still show', () => {
    expect(affectsUs({ ...q89, level: 'Magnitude 3.0', title: 'M 3.0 quake', what: '' }, conel)).toEqual({ affects: false, km: 89, line: 'Probably too far to feel strongly. If you felt shaking, follow the steps below.', steps: true })
  })
  it('felt radius by magnitude: 50, 100, 200, 400, 800 km, unknown 100', () => {
    const km = (level: string) => quakeFeltKm({ level, title: '', what: '' })
    expect([km('Magnitude 3.9'), km('Magnitude 4.0'), km('Magnitude 5.9'), km('Magnitude 6.0'), km('Magnitude 6.9'), km('Magnitude 7.0'), km('Strong')]).toEqual([50, 100, 200, 400, 400, 800, 100])
    expect(km('Magnitude 5.0')).toBe(200)
  })
  it('a typhoon 160 km away is far and has no steps; the line never says no action needed', () => {
    const r = affectsUs({ ...q89, kind: 'tcws', lat: conel.lat + 1.44 }, conel) // 1.44 deg = 160 km
    expect(r).toEqual({ affects: false, km: 160, line: 'Far from you. Watch for updates.', steps: false })
    expect(JSON.stringify(r)).not.toMatch(/no action needed/i)
  })
  it('the same distance for a typhoon still counts (storms reach 150 km)', () => {
    const r = affectsUs({ ...q89, kind: 'tcws' }, conel)
    expect(r.affects).toBe(true)
    expect(r.line).toBe('Near you. Follow the steps below.')
  })
  it('a quake 30 km away is near you; one near the other home zone says near home', () => {
    expect(affectsUs(a('q30', 'quake', { lat: conel.lat + 0.27, lon: conel.lon }), conel)).toMatchObject({ affects: true, km: 30, line: 'Near you. Follow the steps below.' })
    // phone far away (Manila), quake 10 km from Dampas (9.645705, 123.877951): near home
    expect(affectsUs(a('qd', 'quake', { lat: 9.645705 + 0.09, lon: 123.877951 }), { lat: 14.6, lon: 121 })).toMatchObject({ affects: true, km: 10, line: 'Near home (Dampas). Follow the steps below.' })
  })
  it('no position and no point: area-wide counts, a far point does not', () => {
    expect(affectsUs(a('w', 'heat'), null).affects).toBe(true)
    expect(affectsUs(a('far', 'quake', { lat: 14.6, lon: 121 }), null).affects).toBe(false) // unknown size counts as 100 km; Manila is about 900 km from both homes
  })
})

describe('plain words and copy', () => {
  it('GDACS population line becomes plain words, never the raw string', () => {
    const raw = 'A Typhoon BAGYO-26 was active. Population affected by Category 1 (120 km/h) wind speeds or higher is 0.291 million.'
    expect(plainWhat({ kind: 'gdacs', what: raw })).toBe('A Typhoon BAGYO-26 was active. About 291,000 people live where the strongest winds or water are expected.')
    expect(plainWhat({ kind: 'gdacs', what: 'Population affected: unknown' })).toBe('')
    expect(plainWhat({ kind: 'quake', what: 'Magnitude 5.1, 40 km north.' })).toBe('Magnitude 5.1, 40 km north.')
  })
  it('wide radius equals the Today band radius (ML-10)', () => {
    // a storm 149 km and 151 km from home: the Safety text and the Today band must agree
    const at = (km: number) => ({ lat: HOME.lat + km / 111.19, lon: HOME.lon })
    expect(ALERT_RADIUS_KM).toBe(150)
    expect(affectsUs(a('s', 'tcws', at(149)), null).affects).toBe(true)
    expect(affectsUs(a('s', 'tcws', at(151)), null).affects).toBe(false)
  })
  it('sources line names only what the ingest reads and the place label matches the Safety chip', () => {
    expect(SOURCES_LINE).toBe('Quakes: USGS. Storms, floods, volcanoes and tsunamis: GDACS and the PAGASA public alert feed. Air quality: Open-Meteo. Checked every 10 minutes. PAGASA bulletins are links you can open.')
    expect(placeLabel({ source: 'zone', zone: 'conel' })).toBe('Conel')
    expect(placeLabel({ source: 'gps', zone: 'dampas' })).toBe('Near you · Dampas')
    expect(placeLabel({ source: 'gps-abroad', zone: 'conel' })).toBe('Away · Conel')
  })
})
