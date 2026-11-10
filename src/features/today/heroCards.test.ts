import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { doseKey, dueDoses, heroCards, parseDose, rainLine, rainOutlook, skyOf, weatherAction, zoneAlert, type Wx } from './heroCards'

const alert = (o: Partial<Alert>): Alert => ({
  id: 'a1', kind: 'tcws', level: 'Signal No. 2', title: 'Typhoon signal no. 2', what: 'w', where: 'Bohol', when: 'Tonight', doNow: 'Charge phones.',
  source: 'PAGASA', sourceUrl: null, issuedAt: '2026-10-18T01:00:00Z', lat: 9.7, lon: 123.9, bulletin: 'b', ...o
})
const baseAlert = alert
const wx: Wx = { temp: 29.4, rainPct: 70, words: 'rainy', at: '2026-10-18T08:10:00Z' }
const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m)
const base = { alerts: [] as Alert[], ref: null, doses: [] }

describe('parseDose', () => {
  it('reads 24h and am/pm times, and skips text with no time', () => {
    expect(parseDose('Losartan 50 mg 8:00')).toEqual({ name: 'Losartan 50 mg', at: 480 })
    expect(parseDose('Metformin 8:30 PM')).toEqual({ name: 'Metformin', at: 20 * 60 + 30 })
    expect(parseDose('Aspirin @ 12:05 am')).toEqual({ name: 'Aspirin', at: 5 })
    expect(parseDose('Losartan')).toBeNull()
    expect(parseDose('8:00')).toBeNull()
    expect(parseDose('Vitamin 25:00')).toBeNull()
  })
})

describe('dose card kicker', () => {
  const kick = (n: Date) => heroCards({ alerts: [], ref: null, doses: [{ name: 'Losartan', at: 480 }], now: n }).find((c) => c.kind === 'dose')!.kicker
  it('says Due until two hours pass, then Not taken yet', () => {
    expect(kick(at(8, 30))).toBe('Due · 8:00 AM')
    expect(kick(at(10, 0))).toBe('Not taken yet · 8:00 AM')
  })
})

describe('dueDoses skips', () => {
  const two = ['Metformin 8:00,20:00']
  it('skipping the 8:00 dose leaves the 20:00 dose due', () => {
    expect(dueDoses(two, [], [doseKey('Metformin', 480)], at(20, 30)).map((d) => d.at)).toEqual([1200])
    expect(dueDoses(two, [], [doseKey('Metformin', 480)], at(9, 0))).toEqual([])
  })
  it('skip 8:00 then take at 20:30: nothing left due (the take is not given to the skipped slot)', () => {
    expect(dueDoses(two, [{ name: 'Metformin', takenAt: at(20, 30).toISOString() }], ['Metformin@480'], at(20, 31))).toEqual([])
  })
  it('a legacy name-only skip covers only the earliest open dose', () => {
    expect(dueDoses(two, [], ['Metformin'], at(20, 30)).map((d) => d.at)).toEqual([1200])
  })
  it('the card counts medicines, not doses', () => {
    const doses = [{ name: 'Metformin', at: 480 }, { name: 'Metformin', at: 1200 }]
    expect(heroCards({ alerts: [], ref: null, doses, now: at(20, 30) }).find((c) => c.kind === 'dose')!.body).toBe('Mark it when you have taken it')
  })
})

describe('dueDoses', () => {
  it('a dose taken 90 minutes early still counts as taken (same rule as Next up)', () => {
    expect(dueDoses(['Losartan 8:00'], [{ name: 'Losartan', takenAt: at(6, 30).toISOString() }], [], at(8, 30))).toEqual([])
  })
  const list = ['Losartan 8:00', 'Metformin 20:00', 'No time here']
  it('is due from its time until taken or skipped', () => {
    expect(dueDoses(list, [], [], at(7, 59))).toEqual([])
    expect(dueDoses(list, [], [], at(8, 30)).map((d) => d.name)).toEqual(['Losartan'])
    expect(dueDoses(list, [], [], at(10, 0)).map((d) => d.name)).toEqual(['Losartan'])
  })
  it('drops a dose already taken today or skipped, but not yesterday\'s', () => {
    expect(dueDoses(list, [{ name: 'losartan', takenAt: at(8, 4).toISOString() }], [], at(8, 30))).toEqual([])
    expect(dueDoses(list, [{ name: 'Losartan', takenAt: new Date(2026, 9, 17, 8, 4).toISOString() }], [], at(8, 30))).toHaveLength(1)
    expect(dueDoses(list, [], ['Losartan'], at(8, 30))).toEqual([])
  })
  it('is empty for a missing or odd profile', () => {
    expect(dueDoses(undefined, [], [], at(8))).toEqual([])
    expect(dueDoses([1, null], [], [], at(8))).toEqual([])
  })
})

describe('zoneAlert', () => {
  it('keeps official warnings near the member and ignores far, utility and air alerts', () => {
    const far = alert({ id: 'far', lat: 35.7, lon: 139.7 })
    const util = alert({ id: 'u', kind: 'utility' })
    const air = alert({ id: 'air', kind: 'air' })
    expect(zoneAlert([far, util, air], null)).toBeNull()
    expect(zoneAlert([far, util, alert({})], null)?.id).toBe('a1')
    expect(zoneAlert([alert({ lat: null, lon: null })], null)?.id).toBe('a1')
  })
})

describe('zoneAlert quakes (D-88)', () => {
  // 1 degree of latitude = 111.195 km. Conel is 6.2015121 N.
  const quake = (id: string, dLat: number, over: Partial<Alert> = {}) => alert({ id, kind: 'quake', level: 'Magnitude 4.6', lat: 6.2015121 + dLat, lon: 125.1878084, ...over })
  const conel = { lat: 6.2015121, lon: 125.1878084 }
  it('a quake 300 km away (2.7 deg) is no longer hidden by the old 150 km filter, and neither is one 2500 km away', () => {
    expect(zoneAlert([quake('q300', 2.7)], conel)?.id).toBe('q300')
    expect(zoneAlert([quake('q2500', -22.483, { level: 'Magnitude 7.2' })], conel)?.id).toBe('q2500')
  })
  it('a typhoon 1001 km away is still hidden, one 999 km away is shown (the hazard radius is 1000 km)', () => {
    expect(zoneAlert([alert({ id: 't', lat: 6.2015121 - 8.984, lon: 125.1878084 })], conel)?.id).toBe('t')
    expect(zoneAlert([alert({ id: 't', lat: 6.2015121 - 9.002, lon: 125.1878084 })], conel)).toBeNull()
  })
  it('within a tier the nearer quake leads', () => {
    expect(zoneAlert([quake('far', 2.7), quake('near', 0.27)], conel)?.id).toBe('near')
  })
  describe('a quiet quake never holds the slot over a real warning', () => {
    const old = new Date(Date.now() - 5 * 3_600_000).toISOString()
    const south = (km: number) => -km / 111.195 // away from the other home zone
    it('old M4.2 at 105 km with an Orange volcano at 120 km: the volcano', () => {
      const list = [quake('old', south(105), { level: 'Magnitude 4.2', issuedAt: old }), quake('v', south(120), { kind: 'volcano', level: 'Orange' })]
      expect(zoneAlert(list, conel)?.id).toBe('v')
    })
    it('fresh M4.2 at 105 km with an Orange volcano at 120 km: the volcano, as Simple Today shows only this slot', () => {
      const list = [quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: new Date().toISOString() }), quake('v', south(120), { kind: 'volcano', level: 'Orange' })]
      expect(zoneAlert(list, conel)?.id).toBe('v')
    })
    it('a fresh quake keeps the slot over a Green volcano, close or far, and over an Orange one far away', () => {
      const q = quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: new Date().toISOString() })
      expect(zoneAlert([q, quake('v', south(120), { kind: 'volcano', level: 'Green' })], conel)?.id).toBe('q')
      expect(zoneAlert([q, quake('v', south(900), { kind: 'volcano', level: 'Green' })], conel)?.id).toBe('q')
      expect(zoneAlert([q, quake('v', south(900), { kind: 'volcano', level: 'Orange' })], conel)?.id).toBe('q')
    })
    it('wherever ranking puts them, a Green or far row never takes the slot from a live quake', () => {
      const fresh = new Date().toISOString()
      const q = quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: fresh })
      expect(zoneAlert([q, quake('v', south(80), { kind: 'volcano', level: 'Green' })], conel)?.id).toBe('q')
      expect(zoneAlert([q, quake('v', 0, { kind: 'volcano', level: 'Green', lat: null, lon: null })], conel)?.id).toBe('q')
      expect(zoneAlert([q, alert({ id: 'r', lat: 6.2015121 + south(400), lon: 125.1878084 })], conel)?.id).toBe('q')
      const red = quake('red', south(150), { level: 'Magnitude 5.0', issuedAt: fresh }) // inside its 200 km felt radius
      expect(zoneAlert([red, quake('v', south(100), { kind: 'volcano', level: 'Green' })], conel)?.id).toBe('red')
    })
    it('after its first hour a quake holds nothing back: 20 hours old against a Red volcano', () => {
      const late = new Date(Date.now() - 20 * 3_600_000).toISOString()
      expect(zoneAlert([quake('q', south(190), { level: 'Magnitude 5.0', issuedAt: late }), quake('v', south(170), { kind: 'volcano', level: 'Red' })], conel)?.id).toBe('v')
      expect(zoneAlert([quake('q', south(900), { level: 'Magnitude 6.2', issuedAt: late }), quake('v', south(400), { kind: 'volcano', level: 'Red' })], conel)?.id).toBe('v')
    })
    it('the hold ends at the hour: 59 minutes holds, 61 does not', () => {
      const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
      const v = quake('v', south(400), { kind: 'volcano', level: 'Red' })
      expect(zoneAlert([quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: ago(59) }), v], conel)?.id).toBe('q')
      expect(zoneAlert([quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: ago(61) }), v], conel)?.id).toBe('v')
    })
    it('an unreadable time counts as recent', () => {
      expect(zoneAlert([quake('q', south(500), { level: 'Magnitude 4.2', issuedAt: 'not a date' }), quake('v', south(400), { kind: 'volcano', level: 'Red' })], conel)?.id).toBe('q')
    })
    it('a recent red-card quake takes the slot from a live compact one, an old one does not', () => {
      const q = quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: new Date().toISOString() })
      expect(zoneAlert([q, quake('r', south(900), { level: 'Magnitude 6.2', issuedAt: new Date().toISOString() })], conel)?.id).toBe('r')
      expect(zoneAlert([q, quake('r', south(900), { level: 'Magnitude 6.2', issuedAt: old })], conel)?.id).toBe('q')
    })
    it('a real warning with no point takes the slot; NEAR_KM is the line for one with a point', () => {
      const q = quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: new Date().toISOString() })
      expect(zoneAlert([q, alert({ id: 'r', kind: 'rainfall', level: 'Orange', lat: null, lon: null })], conel)?.id).toBe('r')
      expect(zoneAlert([q, quake('v', south(149), { kind: 'volcano', level: 'Orange' })], conel)?.id).toBe('v')
      expect(zoneAlert([q, quake('v', south(151), { kind: 'volcano', level: 'Orange' })], conel)?.id).toBe('q')
    })
    it('heat never takes the slot from a live quake', () => {
      const q = quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: new Date().toISOString() })
      expect(zoneAlert([q, alert({ id: 'h', kind: 'heat', level: 'Caution', lat: 6.2015121, lon: 125.1878084 })], conel)?.id).toBe('q')
    })
    it('a close real warning still takes the slot, nearer than the quake or not', () => {
      const q = quake('q', south(105), { level: 'Magnitude 4.2', issuedAt: new Date().toISOString() })
      expect(zoneAlert([q, quake('v', south(80), { kind: 'volcano', level: 'Orange' })], conel)?.id).toBe('v')
    })
    it('old M5.0 at 205 km with a fresh M5.4 at 215 km: the M5.4', () => {
      const list = [quake('old', south(205), { level: 'Magnitude 5.0', issuedAt: old }), quake('fresh', south(215), { level: 'Magnitude 5.4', issuedAt: new Date().toISOString() })]
      expect(zoneAlert(list, conel)?.id).toBe('fresh')
    })
    it('only quiet quakes: the nearer one still shows', () => {
      const list = [quake('far', south(300), { level: 'Magnitude 4.2', issuedAt: old }), quake('near', south(105), { level: 'Magnitude 4.2', issuedAt: old })]
      expect(zoneAlert(list, conel)?.id).toBe('near')
    })
  })
  it('a strong quake keeps the one slot against a nearer quiet row (M4.6 at 272 km vs M6.8 at 300 km)', () => {
    expect(zoneAlert([quake('quiet', 2.45), quake('big', 2.7, { level: 'Magnitude 6.8' })], conel)?.id).toBe('big')
  })
})

describe('heroCards priority', () => {
  const dose = { name: 'Losartan', at: 480 }
  it('alert, then dose', () => {
    expect(heroCards({ ...base, alerts: [alert({})], doses: [dose] }).map((c) => c.kind)).toEqual(['alert', 'dose'])
  })
  it('nothing applies: one calm summary', () => {
    expect(heroCards(base).map((c) => c.kind)).toEqual(['summary'])
  })
  it('the alert card offers What to do and I am OK', () => {
    expect(heroCards({ ...base, alerts: [alert({})] })[0]!.actions.map((a) => a.id)).toEqual(['safety', 'ok'])
  })
})

describe('rain timing', () => {
  const times = Array.from({ length: 48 }, (_, h) => `2026-10-${h < 24 ? '19' : '20'}T${String(h % 24).padStart(2, '0')}:00`)
  const hourly = (f: (h: number) => number) => ({ time: times, prob: times.map((_, h) => f(h)) })
  // 2026-10-19 11:20 Manila = 03:20 UTC
  const at = (h: number) => new Date(Date.UTC(2026, 9, 19, h - 8, 20))
  const w = (f: (h: number) => number, code = 3): Wx => ({ ...wx, code, hourly: hourly(f) })
  const card = (x: Wx, h: number) => ({ body: rainLine(x, at(h)) })
  it('finds the start, length and peak from the current hour', () => {
    expect(rainOutlook(times, hourly((h) => (h >= 15 && h < 19 ? (h === 16 ? 100 : 70) : 10)).prob, '2026-10-19T11:20')).toEqual({ now: false, tomorrow: false, startH: 15, endH: 19, hours: 4, peakPct: 100 })
    const c = card(w((h) => (h >= 15 && h < 19 ? (h === 16 ? 100 : 70) : 10)), 11)
    expect(c.body).toBe('Rain likely from 3 PM for about 4 hours. Next hours: 100%.')
  })
  it('rain now only when the sky shows rain; otherwise it looks from the next hour', () => {
    const f = (h: number) => (h >= 14 && h < 17 ? 60 : 0)
    expect(card(w(f, 63), 14).body).toBe('Rain now, easing around 5 PM.')
    expect(card(w(f, 3), 14).body).toBe('Rain likely from 3 PM for about 2 hours. Next hours: 60%.')
  })
  it('says tomorrow, with a matching title', () => {
    const c = card(w((h) => (h >= 30 && h < 33 ? 80 : 0)), 20)
    expect(c.body).toBe('Rain likely tomorrow from 6 AM for about 3 hours. Tomorrow up to 80%.')
    expect(c.body).not.toContain('Next hours') // tomorrow's peak is not the next hours
  })
  it('is worked out at render time: later in the day the same cache reads differently, and a past window gives no umbrella', () => {
    const x = w((h) => (h >= 15 && h < 17 ? 90 : 0))
    expect(card(x, 11).body).toContain('from 3 PM')
    const late = card({ ...x, rainPct: 90 }, 20)
    expect(late.body).toBe('No more rain expected for now.')
    expect(late.body).not.toContain('umbrella')
  })
  it('null when no hour reaches 50, undefined without hourly data, old text kept', () => {
    expect(rainOutlook(times, hourly(() => 20).prob, '2026-10-19T08:00')).toBeNull()
    expect(rainOutlook(undefined, undefined, '2026-10-19T08:00')).toBeUndefined()
    expect(rainLine(wx, at(11))).toBe('Bring an umbrella. Today up to 70%.')
  })
  it('W4: every percentage in the rain line is labelled daily or hourly, never bare', () => {
    const hourlyWx = { ...wx, hourly: hourly((h) => (h >= 15 && h < 19 ? 80 : 10)) }
    const lines = [rainLine(hourlyWx, at(11)), rainLine(wx, at(11)), rainLine({ ...wx, rainPct: 40 }, at(11))]
    for (const l of lines) for (const m of l.matchAll(/\d+%/g)) expect(l.slice(0, m.index)).toMatch(/(Next hours: |Today up to |Tomorrow up to )$/)
    expect(lines[0]).toContain('Next hours: 80%')
  })
  it('sky from weather code', () => {
    expect([0, 2, 45, 63, 96, undefined].map((c) => skyOf({ ...wx, code: c }))).toEqual(['clear', 'cloud', 'fog', 'rain', 'storm', undefined])
  })
})

describe('rainLine with raining now (S29)', () => {
  it('an airport or model raining-now counts as rain even when the code looks dry and this hour is low', () => {
    const now = new Date('2026-10-19T02:00:00Z') // 10:00 Manila
    const hourly = { time: ['2026-10-19T10:00', '2026-10-19T11:00', '2026-10-19T12:00'], prob: [20, 70, 70] }
    const base = { temp: 27, rainPct: 70, words: 'partly cloudy', code: 2, at: '', hourly, utcOffset: 8 * 3600 }
    expect(rainLine(base, now)).not.toBe(rainLine({ ...base, rainingNow: { value: true, source: 'observed' as const, ageMin: 10 } }, now))
    expect(rainLine({ ...base, rainingNow: { value: true, source: 'observed' as const, ageMin: 10 } }, now)).toBe('Rain now. More likely from 11 AM.')
  })
})

describe('weatherAction (Today and Simple mode action line)', () => {
  const w = (o: Partial<Wx>): Wx => ({ temp: 28, rainPct: 10, words: 'clear', at: '2026-10-19T00:00:00Z', humidity: 60, ...o })
  const now = new Date('2026-10-19T02:00:00Z') // 10:00 in Manila
  it('is the top line of the Weather screen actionLines(): heat index first, then rain, nothing otherwise', () => {
    expect(weatherAction(w({ temp: 31, humidity: 65 }), now)).toBe('Avoid the noon sun. Drink water often.')
    expect(weatherAction(w({ temp: 28, humidity: 60 }), now)).toBeNull() // heat index 31: Caution is not an action line
    const hourly = { time: ['2026-10-19T12:00', '2026-10-19T13:00'], prob: [80, 70] }
    expect(weatherAction(w({ hourly }), now)).toMatch(/^Rain likely 12-2 PM/)
    expect(weatherAction(w({ temp: 36, humidity: 70, hourly }), now)).toMatch(/^Stay indoors/) // heat outranks rain
  })
  it('S29: while it rains (Simple mode too) the sun/heat tip goes, Danger heat stays', () => {
    const rn = { value: true, source: 'model' as const, ageMin: null }
    expect(weatherAction(w({ temp: 31, humidity: 65, rainingNow: rn }), now)).toBeNull()
    expect(weatherAction(w({ temp: 31, humidity: 65, rainingNow: { ...rn, value: false } }), now)).toBe('Avoid the noon sun. Drink water often.')
    expect(weatherAction(w({ temp: 36, humidity: 70, rainingNow: rn }), now)).toMatch(/^Stay indoors/)
  })
  it('a hot day with no humidity reading earns no heat line (the heat index needs both)', () => {
    expect(weatherAction(w({ temp: 36, humidity: null }), now)).toBeNull()
  })
  it('unknown temperature or no reading gives no line, never a guess', () => {
    expect(weatherAction(w({ temp: null, rainPct: 90 }), now)).toBeNull()
    expect(weatherAction(null)).toBeNull()
  })
})

describe('zoneAlert: urgent hazards take the slot', () => {
  const alert = (o: Partial<Alert>) => baseAlert({ issuedAt: new Date().toISOString(), ...o }) // urgent means under 24 h old
  const flood = alert({ id: 'f', kind: 'rainfall', level: 'Orange', title: 'Rainfall advisory', lat: null, lon: null })
  const quake68 = alert({ id: 'q', kind: 'quake', level: 'Magnitude 6.8', title: 'Earthquake M6.8', source: 'PHIVOLCS' })
  it('shows an M6.8 quake over a flood advisory', () => expect(zoneAlert([flood, quake68], null)?.id).toBe('q'))
  it('shows a tsunami over heat', () => {
    const heat = alert({ id: 'h', kind: 'heat', level: 'Danger', title: 'Heat', lat: null, lon: null })
    const tsu = alert({ id: 't', kind: 'tsunami', level: 'Warning', title: 'Tsunami' })
    expect(zoneAlert([heat, tsu], null)?.id).toBe('t')
  })
  it('a far M6 (about 1,400 km) does not take the slot from a local flood; a near M6 does; a day-old M6 does not', () => {
    const lf = alert({ id: 'lf', kind: 'rainfall', level: 'Orange', title: 'Rainfall advisory', lat: 6.2, lon: 125.19 })
    const far = alert({ id: 'far', kind: 'quake', level: 'Magnitude 6.1', title: 'Earthquake M6.1', source: 'PHIVOLCS', lat: 18.5, lon: 122 })
    const near = alert({ id: 'near', kind: 'quake', level: 'Magnitude 6.1', title: 'Earthquake M6.1', source: 'PHIVOLCS', lat: 6.5, lon: 125.4 })
    const old = { ...near, id: 'old', issuedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }
    expect(zoneAlert([lf, far], null)?.id).toBe('lf')
    expect(zoneAlert([lf, near], null)?.id).toBe('near')
    expect(zoneAlert([lf, old], null)?.id).toBe('lf')
  })
  it('shows the quake once the flood is closed out of the pool', () => expect(zoneAlert([quake68], null)?.id).toBe('q'))
})
