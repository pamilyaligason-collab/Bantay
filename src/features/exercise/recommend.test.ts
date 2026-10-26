import { describe, expect, it } from 'vitest'
import { MOVES, matchConditions, recommend, type RecommendInput } from './recommend'
import { ageFrom, latestVitals } from './data'

const base: RecommendInput = { age: 70, conditions: [], gateOk: true, doctorOk: false, doneThisWeek: [] }
const rec = (o: Partial<RecommendInput> = {}) => recommend({ ...base, ...o })

describe('moves content', () => {
  it('has 55 or more moves, unique ids, 3 to 5 steps and a stop-if each', () => {
    expect(MOVES.length).toBeGreaterThanOrEqual(55)
    expect(new Set(MOVES.map((m) => m.id)).size).toBe(MOVES.length)
    for (const m of MOVES) {
      expect(m.steps.length).toBeGreaterThanOrEqual(3)
      expect(m.steps.length).toBeLessThanOrEqual(5)
      expect(m.stopIf.length).toBeGreaterThan(0)
      expect(m.durationSec != null || m.reps != null).toBe(true)
      expect(m.tl.length).toBeGreaterThan(2)
    }
  })
})

describe('mobility and videos', () => {
  it('has a mobility group of 8 or more, and every video is a valid id with its channel and title', () => {
    expect(MOVES.filter((m) => m.group === 'mobility').length).toBeGreaterThanOrEqual(8)
    const withVideo = MOVES.filter((m) => m.video)
    expect(withVideo.length).toBeGreaterThanOrEqual(25)
    for (const m of withVideo) {
      expect(m.video!.id).toMatch(/^[A-Za-z0-9_-]{11}$/)
      expect(m.video!.channel.length).toBeGreaterThan(2)
      expect(m.video!.title.length).toBeGreaterThan(2)
    }
  })
  it('available lists every move allowed today and includes the picks; osteoporosis keeps twists out', () => {
    const r = rec()
    expect(r.available.length).toBeGreaterThan(20)
    expect(r.picks.every((m) => r.available.includes(m))).toBe(true)
    expect(r.available.every((m) => m.level === 1)).toBe(true)
    const o = rec({ conditions: ['osteoporosis'], doctorOk: true, age: 55 })
    expect(o.available.some((m) => m.avoidIf.includes('twist') || m.posture === 'floor')).toBe(false)
  })
  it('a gate or a rest day has nothing available', () => {
    expect(rec({ gateOk: false }).available).toEqual([])
  })
})

describe('gate', () => {
  it('shows only the doctor check until it is acknowledged, for everyone', () => {
    for (const age of [30, 70, 85, null]) {
      const r = rec({ age, gateOk: false })
      expect(r.gate).toBe(true)
      expect(r.picks).toEqual([])
    }
    expect(rec({ gateOk: true }).gate).toBe(false)
  })
})

describe('age', () => {
  it.each([[65], [70], [null], [undefined]])('age %s: three picks, level 1, balance and strength first', (age) => {
    const r = rec({ age })
    expect(r.picks).toHaveLength(3)
    expect(r.picks.every((m) => m.level === 1)).toBe(true)
    expect(r.picks.map((m) => m.group).slice(0, 2)).toEqual(['balance', 'strength'])
    expect(r.picks.every((m) => m.posture !== 'floor')).toBe(true)
  })
  it('80+ gets seated or supported moves only', () => {
    for (const age of [80, 92]) expect(rec({ age }).picks.every((m) => m.posture === 'seated' || m.posture === 'standing-with-support')).toBe(true)
  })
  it('under 65 may get level 2 and starts with strength', () => {
    const r = rec({ age: 50 })
    expect(r.picks[0]!.group).toBe('strength')
    expect(r.picks.every((m) => m.level <= 2)).toBe(true)
  })
  it('prefers moves not done this week', () => {
    const first = rec().picks
    const second = rec({ doneThisWeek: first.map((m) => m.id) }).picks
    for (const m of first) expect(second.map((x) => x.id)).not.toContain(m.id)
  })
  it('age 0 or NaN is unknown, not a baby', () => {
    expect(rec({ age: 0 }).picks.every((m) => m.level === 1)).toBe(true)
    expect(rec({ age: Number.NaN }).picks.every((m) => m.level === 1)).toBe(true)
  })
})

describe('conditions', () => {
  it('matches English and Tagalog free text', () => {
    expect(matchConditions(['High blood pressure', 'Rayuma', 'diabetes type 2', 'sakit sa puso', 'Osteoporosis', 'hika'])).toEqual(['hypertension', 'arthritis', 'diabetes', 'heart', 'osteoporosis', 'asthma'])
    expect(matchConditions(['altapresyon', 'asukal'])).toEqual(['hypertension', 'diabetes'])
    expect(matchConditions(['hay fever'])).toEqual([])
  })
  it('hypertension: no holds, breathing reminder', () => {
    const r = rec({ conditions: ['hypertension'] })
    expect(r.picks.some((m) => m.avoidIf.includes('hold'))).toBe(false)
    expect(r.notes.join(' ')).toMatch(/breath/i)
  })
  it('high latest BP: rest today, no picks; normal BP: picks', () => {
    const r = rec({ conditions: ['altapresyon'], latestBp: { sys: 165, dia: 100 } })
    expect(r.rest?.why).toBe('bp')
    expect(r.rest?.text).toMatch(/blood pressure/)
    expect(r.picks).toEqual([])
    expect(rec({ conditions: ['hypertension'], latestBp: { sys: 110, dia: 70 } }).rest).toBeNull()
    expect(rec({ conditions: [], latestBp: { sys: 165, dia: 100 } }).rest).toBeNull() // only the condition triggers the rule
  })
  it('diabetes: snack reminder; low sugar rests; unknown sugar does not', () => {
    expect(rec({ conditions: ['diabetes'] }).notes.join(' ')).toMatch(/snack/)
    expect(rec({ conditions: ['diabetes'], latestSugar: 62 }).rest?.why).toBe('sugar')
    expect(rec({ conditions: ['diabetes'], latestSugar: 110 }).rest).toBeNull()
    expect(rec({ conditions: ['diabetes'], latestSugar: null }).rest).toBeNull()
  })
  it('heart or osteoporosis: walking and seated moves only until the doctor said OK', () => {
    for (const c of ['heart', 'puso', 'osteoporosis']) {
      const r = rec({ conditions: [c], age: 60 })
      expect(r.restricted).toBe(true)
      expect(r.picks.length).toBeGreaterThan(0)
      expect(r.picks.every((m) => m.group === 'walk' || m.posture === 'seated')).toBe(true)
    }
    const ok = rec({ conditions: ['heart'], doctorOk: true })
    expect(ok.restricted).toBe(false)
    expect(ok.picks.some((m) => m.group === 'balance')).toBe(true)
  })
  it('osteoporosis avoids forward bends and floor work even after the doctor said OK', () => {
    const r = rec({ conditions: ['osteoporosis'], doctorOk: true, age: 55 })
    expect(r.picks.every((m) => !m.avoidIf.includes('forward-bend') && m.posture !== 'floor')).toBe(true)
  })
  it('arthritis avoids deep knee work; asthma reminds about the inhaler', () => {
    expect(rec({ conditions: ['arthritis'], age: 50 }).picks.every((m) => !m.avoidIf.includes('deep-knee'))).toBe(true)
    expect(rec({ conditions: ['hika'] }).notes.join(' ')).toMatch(/inhaler/)
  })
})

describe('profile data helpers', () => {
  it('ageFrom: whole years, null for blank or junk', () => {
    const now = new Date(2026, 9, 21)
    expect(ageFrom('1956-10-21', now)).toBe(70)
    expect(ageFrom('1956-10-22', now)).toBe(69)
    expect(ageFrom(null, now)).toBeNull()
    expect(ageFrom('', now)).toBeNull()
    expect(ageFrom('not-a-date', now)).toBeNull()
    expect(ageFrom('2030-01-01', now)).toBeNull()
  })
  it('latestVitals: newest reading in the last 24 hours, converts mmol/L, ignores old ones', () => {
    const now = new Date('2026-10-21T12:00:00Z')
    const r = (test: string, value: number, takenAt: string, unit?: string) => ({ personId: 'p', test, value, takenAt, unit })
    const v = latestVitals([
      r('bp_systolic', 150, '2026-10-21T07:00:00Z'), r('bp_diastolic', 95, '2026-10-21T07:00:00Z'),
      r('bp_systolic', 118, '2026-10-19T07:00:00Z'), r('fasting_glucose', 3.5, '2026-10-21T06:00:00Z', 'mmol/L')
    ], now)
    expect(v.latestBp).toEqual({ sys: 150, dia: 95 })
    expect(v.latestSugar).toBeCloseTo(63.1, 1)
    expect(latestVitals([r('bp_systolic', 150, '2026-10-19T07:00:00Z')], now)).toEqual({ latestBp: null, latestSugar: null })
  })
})

describe("the person's own limits win over the guide", () => {
  const hyp = { conditions: ['Hypertension'], latestBp: { sys: 135, dia: 85 } }
  it('guide only: 135/85 is above, so rest', () => expect(rec(hyp).rest?.why).toBe('bp'))
  it('family limit higher than the reading: no rest day', () => {
    expect(rec({ ...hyp, family: { sys: { low: null, high: 150 }, dia: { low: null, high: 95 } } }).rest).toBeNull()
  })
  it('family limit lower than the guide: rest day for a reading the guide calls fine', () => {
    const r = rec({ conditions: ['Hypertension'], latestBp: { sys: 115, dia: 70 }, family: { sys: { low: null, high: 110 } } })
    expect(r.rest?.why).toBe('bp')
  })
  it('sugar: family low of 60 lets 65 through; family low of 80 rests at 75', () => {
    expect(rec({ conditions: ['Diabetes'], latestSugar: 65, family: { sugar: { low: 60, high: null } } }).rest).toBeNull()
    expect(rec({ conditions: ['Diabetes'], latestSugar: 75, family: { sugar: { low: 80, high: null } } }).rest?.why).toBe('sugar')
    expect(rec({ conditions: ['Diabetes'], latestSugar: 65 }).rest?.why).toBe('sugar')
  })
})
