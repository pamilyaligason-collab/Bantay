import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALERT_RADIUS_KM } from '../today/heroCards'
import { affectsUs, quakeFeltKm, quakeMag, type Alert, diffBulletin, distanceKm, freshness, freshText, hazardOf, HOME, newestChecked, outdatedLine, placeLabel, plainWhat, rankAlerts, SOURCES_FULL, SOURCES_LINE, splitEonet, tierOf } from './alerts'

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
    expect(outdatedLine(null)).toMatch(/not been checked yet. They may be out of date\./)
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
  const ABOUT = (km: number) => `About ${km} km away. You may feel it. If you feel shaking, follow the steps below.`
  const TSUNAMI = ' If you live near the sea, watch for a tsunami warning.'
  const fresh = new Date().toISOString()
  const SOFT = { affects: true, line: 'Probably too far to feel strongly. If you felt shaking, follow the steps below.', steps: true }
  it('an 89 km M3.0 quake under an hour old is felt to 50 km only: it still affects the family, with the distance and the steps', () => {
    expect(affectsUs({ ...q89, level: 'Magnitude 3.0', title: 'M 3.0 quake', what: '', issuedAt: fresh }, conel)).toEqual({ affects: true, km: 89, line: ABOUT(89), steps: true })
  })
  it('M3.6 at 140 km (1.2591 deg x 111.195 km) is beyond its 50 km radius: About 140 km away', () => {
    const q = a('q140', 'quake', { level: 'Magnitude 3.6', lat: conel.lat + 1.2591, lon: conel.lon, issuedAt: fresh })
    expect(Math.round(distanceKm(conel, { lat: q.lat!, lon: q.lon! }))).toBe(140)
    expect(affectsUs(q, conel)).toEqual({ affects: true, km: 140, line: ABOUT(140), steps: true })
  })
  it('the same far M3.6 quake hours old, with no live phone position: the soft line and the steps', () => {
    const q = a('q140', 'quake', { level: 'Magnitude 3.6', lat: conel.lat + 1.2591, lon: conel.lon, issuedAt: new Date(Date.now() - 5 * 3_600_000).toISOString() })
    expect(affectsUs(q, conel)).toEqual({ ...SOFT, km: 140 })
  })
  describe('"No action needed" needs a live, named phone position', () => {
    const NOW = Date.parse('2026-11-01T12:00:00Z')
    const old = '2026-11-01T07:00:00Z'
    const davao = { lat: 7.07, lon: 125.6 }
    // 1.2591 deg north of Davao = 140 km; beyond 50 km of M3.6, and beyond it from both home zones
    const q = a('q', 'quake', { level: 'Magnitude 3.6', lat: davao.lat + 1.2591, lon: davao.lon, issuedAt: old })
    const live = { source: 'gps', zone: 'conel', weather: davao, fixAt: NOW - 60_000 }
    it('live GPS in a named area: the board wording, naming the area, no steps', () => {
      expect(affectsUs(q, davao, NOW, live)).toEqual({ affects: true, km: 140, line: 'Too far to feel in Davao. No action needed.', steps: false })
    })
    it.each([
      ['no place at all', undefined],
      ['home zone only (location off)', { source: 'zone', zone: 'conel', weather: conel }],
      ['an old last fix', { ...live, source: 'last' }],
      ['GPS whose fix is 31 min old', { ...live, fixAt: NOW - 31 * 60_000 }],
      ['GPS with no fix time', { ...live, fixAt: undefined }],
      ['GPS outside every named area', { ...live, weather: { lat: 12, lon: 120 } }],
      ['a phone abroad', { ...live, source: 'gps-abroad' }]
    ])('%s: the soft line and the steps', (_n, place) => {
      expect(affectsUs(q, davao, NOW, place)).toEqual({ ...SOFT, km: 140 })
    })
    it('location off, home zone far, the epicentre under the person (Surigao, 177 km from Dampas): never "no action", steps shown', () => {
      const dampas = { lat: 9.645705, lon: 123.877951 }
      const surigao = a('s', 'quake', { level: 'Magnitude 4.7', lat: 9.79, lon: 125.49, issuedAt: old }) // hand-computed: 1.612 deg lon x cos 9.7 x 111.2 = 176.7 km, 0.144 deg lat = 16 km: 177 km
      const r = affectsUs(surigao, dampas, NOW, { source: 'zone', zone: 'dampas', weather: dampas })
      expect(r).toEqual({ ...SOFT, km: 177 })
      expect(r.line).not.toMatch(/no action/i)
    })
    it('a live position changes nothing for a fresh, M6 or unknown-size quake', () => {
      for (const over of [{ issuedAt: '2026-11-01T11:30:00Z' }, { level: 'Magnitude 6.1', lat: davao.lat + 5 }, { level: null, title: 'Quake', what: '' }]) {
        const r = affectsUs({ ...q, ...over }, davao, NOW, live)
        expect(r.steps).toBe(true)
        expect(r.line).not.toMatch(/no action|too far/i)
      }
    })
  })
  it('never quiet when the size is unknown, the quake is M6 or more, or its point is missing', () => {
    const old = new Date(Date.now() - 5 * 3_600_000).toISOString()
    const far = { lat: conel.lat + 3, lon: conel.lon, issuedAt: old }
    expect(affectsUs(a('u', 'quake', { level: null, ...far }), conel).steps).toBe(true)
    expect(affectsUs(a('m6', 'quake', { level: 'Magnitude 6.1', lat: conel.lat + 5, lon: conel.lon, issuedAt: old }), conel).steps).toBe(true)
    expect(affectsUs(a('np', 'quake', { level: 'Magnitude 3.6', issuedAt: old }), conel).steps).toBe(true)
    expect(affectsUs(a('bad', 'quake', { level: 'Magnitude 3.6', lat: conel.lat + 1.2591, lon: conel.lon, issuedAt: 'nonsense' }), conel).steps).toBe(true)
  })
  it('M7.2 at 2500 km (22.483 deg due south of Conel) says About 2500 km and adds the tsunami line', () => {
    const q = a('q2500', 'quake', { level: 'Magnitude 7.2', lat: conel.lat - 22.483, lon: conel.lon })
    expect(Math.round(distanceKm(conel, { lat: q.lat!, lon: q.lon! }))).toBe(2500)
    expect(affectsUs(q, conel)).toEqual({ affects: true, km: 2500, line: ABOUT(2500) + TSUNAMI, steps: true })
  })
  it('the tsunami line starts at M6.5: M6.4 far away has none, M6.5 has it, and a near M7.2 has it too', () => {
    const far = (level: string) => affectsUs(a('f', 'quake', { level, lat: conel.lat - 8.99, lon: conel.lon }), conel) // 8.99 deg = 999.7 km, beyond the 400 km radius of M6
    expect(far('Magnitude 6.4').line).toBe(ABOUT(1000))
    expect(far('Magnitude 6.5').line).toBe(ABOUT(1000) + TSUNAMI)
    expect(affectsUs(a('n', 'quake', { level: 'Magnitude 7.2', lat: conel.lat + 0.27, lon: conel.lon }), conel).line).toBe('Near you. Follow the steps below.' + TSUNAMI)
    expect(quakeMag({ level: 'Strong', title: '', what: '' })).toBeNull()
  })
  it('a far quake of unknown size gets the steps but no tsunami line (never a guessed magnitude)', () => {
    const r = affectsUs(a('u', 'quake', { level: 'Strong', title: 'Earthquake', what: '', lat: conel.lat - 8.99, lon: conel.lon }), conel)
    expect(r).toEqual({ affects: true, km: 1000, line: ABOUT(1000), steps: true })
  })
  it('a heat reading 900 km away does not affect the family (heat counts near you only)', () => {
    const r = affectsUs({ ...q89, kind: 'heat', lat: conel.lat - 8.1 }, conel)
    expect(r).toEqual({ affects: false, km: 901, line: 'Far from you. Watch for updates.', steps: false })
  })
  it('felt radius by magnitude: 50, 100, 200, 400, 800 km, unknown 100', () => {
    const km = (level: string) => quakeFeltKm({ level, title: '', what: '' })
    expect([km('Magnitude 3.9'), km('Magnitude 4.0'), km('Magnitude 5.9'), km('Magnitude 6.0'), km('Magnitude 6.9'), km('Magnitude 7.0'), km('Strong')]).toEqual([50, 100, 200, 400, 400, 800, 100])
    expect(km('Magnitude 5.0')).toBe(200)
  })
  it('a typhoon 900 km away (8.1 deg due south of Conel x 111.195 = 900.7 km) still affects the family, with the steps', () => {
    const r = affectsUs({ ...q89, kind: 'tcws', lat: conel.lat - 8.1 }, conel)
    expect(r).toEqual({ affects: true, km: 901, line: 'About 901 km away. Follow the steps below.', steps: true })
    expect(JSON.stringify(r)).not.toMatch(/no action needed/i)
  })
  it('a typhoon 1100 km away (9.9 deg = 1100.8 km) is far: no steps, and the line never says no action needed', () => {
    const r = affectsUs({ ...q89, kind: 'tcws', lat: conel.lat - 9.9 }, conel)
    expect(r).toEqual({ affects: false, km: 1101, line: 'Far from you. Watch for updates.', steps: false })
    expect(JSON.stringify(r)).not.toMatch(/no action needed/i)
  })
  it('air quality keeps the 50 km limit: 40 km is near, 60 km (0.54 deg = 60.05 km) is far', () => {
    expect(affectsUs(a('air40', 'air', { lat: conel.lat + 0.36, lon: conel.lon }), conel)).toMatchObject({ affects: true, km: 40, steps: true })
    expect(affectsUs(a('air60', 'air', { lat: conel.lat + 0.54, lon: conel.lon }), conel)).toEqual({ affects: false, km: 60, line: 'Far from you. Watch for updates.', steps: false })
  })
  it('the same distance for a typhoon (89 km) is near you', () => {
    const r = affectsUs({ ...q89, kind: 'tcws' }, conel)
    expect(r.affects).toBe(true)
    expect(r.line).toBe('Near you. Follow the steps below.')
  })
  it('a quake 30 km away is near you; one near the other home zone says near home', () => {
    expect(affectsUs(a('q30', 'quake', { lat: conel.lat + 0.27, lon: conel.lon }), conel)).toMatchObject({ affects: true, km: 30, line: 'Near you. Follow the steps below.' })
    // phone far away (Manila), quake 10 km from Dampas (9.645705, 123.877951): near home
    expect(affectsUs(a('qd', 'quake', { lat: 9.645705 + 0.09, lon: 123.877951 }), { lat: 14.6, lon: 121 })).toMatchObject({ affects: true, km: 10, line: 'Near home (Dampas). Follow the steps below.' })
  })
  it('no position and no point: area-wide counts; a quake in Manila counts too, with the distance; a Manila typhoon is inside 1000 km of Dampas', () => {
    expect(affectsUs(a('w', 'heat'), null).affects).toBe(true)
    const manilaQuake = affectsUs(a('far', 'quake', { lat: 14.6, lon: 121 }), null) // unknown size counts as 100 km; Manila is about 590 km from Dampas
    expect(manilaQuake).toMatchObject({ affects: true, steps: true })
    expect(manilaQuake.line).toMatch(/^About \d+ km away\. You may feel it\. If you feel shaking, follow the steps below\.$/)
    expect(affectsUs(a('t', 'tcws', { lat: 14.6, lon: 121 }), null).affects).toBe(true)
  })
})

describe('plain words and copy', () => {
  it('GDACS population line becomes plain words, never the raw string', () => {
    const raw = 'A Typhoon BAGYO-26 was active. Population affected by Category 1 (120 km/h) wind speeds or higher is 0.291 million.'
    expect(plainWhat({ kind: 'gdacs', what: raw })).toBe('A Typhoon BAGYO-26 was active. About 291,000 people live where the strongest winds or water are expected.')
    expect(plainWhat({ kind: 'gdacs', what: 'Population affected: unknown' })).toBe('')
    expect(plainWhat({ kind: 'quake', what: 'Magnitude 5.1, 40 km north.' })).toBe('Magnitude 5.1, 40 km north.')
  })
  it('wide radius equals the Today band radius (ML-10): 1000 km (D-88)', () => {
    // a storm 999 km and 1001 km from home: the Safety text and the Today band must agree
    const at = (km: number) => ({ lat: HOME.lat + km / 111.195, lon: HOME.lon })
    expect(ALERT_RADIUS_KM).toBe(1000)
    expect(affectsUs(a('s', 'tcws', at(999)), null).affects).toBe(true)
    expect(affectsUs(a('s', 'tcws', at(1001)), null).affects).toBe(false)
  })
  it('sources line names only what the ingest reads and the place label matches the Safety chip', () => {
    expect(SOURCES_LINE).toBe('From PAGASA, USGS, GDACS. Checked every 10 min.')
    expect(SOURCES_FULL).toContain('Open-Meteo') // CC BY 4.0 credit stays on the Sources disclosure
    expect(placeLabel({ source: 'zone', zone: 'conel' })).toBe('Conel, General Santos')
    expect(placeLabel({ source: 'gps', zone: 'dampas', weather: { lat: 6.11, lon: 125.17 } })).toBe('General Santos')
    expect(placeLabel({ source: 'zone', zone: 'dampas', picked: false })).toBe('Dampas, Tagbilaran · your home area')
    expect(placeLabel({ source: 'gps-abroad', zone: 'conel' })).toBe('Away · Conel, General Santos')
  })
})

describe('eonet kind (Phase 2 lane A)', () => {
  it('ranks last, below GDACS context, and never takes a hazard word', () => {
    expect(tierOf('eonet')).toBe(5)
    expect(tierOf('eonet')).toBeGreaterThan(tierOf('gdacs'))
    expect(rankAlerts([a('e', 'eonet'), a('g', 'gdacs'), a('t', 'tcws')], null).map((x) => x.id)).toEqual(['t', 'g', 'e'])
    expect(hazardOf('eonet')).toBeNull()
  })
  it('splitEonet separates awareness rows from the official list and keeps order', () => {
    const list = [a('q', 'quake'), a('e1', 'eonet'), a('t', 'tcws'), a('e2', 'eonet')]
    const { official, eonet } = splitEonet(list)
    expect(official.map((x) => x.id)).toEqual(['q', 't'])
    expect(eonet.map((x) => x.id)).toEqual(['e1', 'e2'])
    expect(splitEonet([])).toEqual({ official: [], eonet: [] })
  })
  it('every kind the ingest can write is in the AlertKind union, eonet included (ML-28)', () => {
    const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
    const kinds = (s: string) => s.match(/'(\w+)'/g)!.map((x) => x.slice(1, -1)).sort()
    const app = kinds(/export type AlertKind = ([^\n]+)/.exec(src('./alerts.ts'))![1])
    const ingest = kinds(/kind: ([^\n]+)\n  level/.exec(src('../../../supabase/functions/alerts-ingest/parse.ts'))![1])
    expect(ingest).toContain('eonet')
    for (const k of ingest) expect(app, k).toContain(k) // the app also knows kinds only an admin or a later source writes (heat, local, utility, thunderstorm)
  })
})
