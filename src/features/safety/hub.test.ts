import { describe, expect, it } from 'vitest'
import { DAMPAS } from '../location/geo'
import hotlines from '../../data/safety/hotlines.json'
import { CHECK_LABEL, coversHere, needsCheck, planDial, splitDial } from './dial'
import type { Entry } from './entries'
import { hazardsFor, hazardStatus, quakeMeaning, toneOf } from './hazardCards'
import { parseHash } from '../shell/routes'

const e = (id: string, group: string, phone: string | null): Entry => ({ id, group, name: id, phone, status: 'CONFIRMED', source: 's', sourceUrl: null, date: 'd' })

describe('splitDial', () => {
  it('groups confirmed numbers and sets the rest aside', () => {
    const r = splitDial([e('a', 'Emergency', '911'), e('b', 'Emergency', null), e('c', 'Sea', ' '), e('d', 'Sea', '143')])
    expect(r.groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([['Emergency', ['a']], ['Sea', ['d']]])
    expect(r.missing.map((m) => m.id)).toEqual(['b', 'c'])
  })
})

describe('hazards', () => {
  it('tones: null is none, never good', () => {
    expect(toneOf(null)).toBe('none')
    expect(toneOf('Safe')).toBe('good')
    expect(toneOf('Low')).toBe('good')
    expect(toneOf('Prone, Intensity VIII')).toBe('warn')
  })
  it('Dampas has four cards, flood unknown, quake warns; other zones have none', () => {
    const v = hazardsFor('dampas')!
    expect(v.cards.map((c) => [c.id, c.tone])).toEqual([['flood', 'none'], ['landslide', 'good'], ['surge', 'good'], ['quake', 'warn']])
    expect(v.rest.map((r) => r.label)).toContain('Severe wind')
    expect(hazardStatus(v)).toBe('Earthquake: can have very destructive shaking')
    const q = v.cards.find((c) => c.id === 'quake')!
    expect(q.todo).toBe('In a big quake this place can have very destructive shaking (Intensity VIII). Old or weak buildings can be damaged. Know a safe spot in each room. Drop, cover and hold on when it shakes.')
    expect(q.todo).not.toMatch(/Prone/)
    expect(hazardsFor('conel')).toBeNull()
    expect(hazardStatus(null)).toBe('Not checked for this place yet')
  })
})

describe('quakeMeaning', () => {
  it('reads the PHIVOLCS intensity, never guesses without one', () => {
    expect(quakeMeaning('Prone, Intensity VII')!.status).toBe('can have destructive shaking')
    expect(quakeMeaning('Prone, Intensity VI')!.status).toBe('can have very strong shaking') // VI must not be read as VII or V
    expect(quakeMeaning('Prone')).toBeNull()
    expect(quakeMeaning(null)).toBeNull()
  })
})

describe('safety sub routes', () => {
  it('keeps the Safety tab lit', () => {
    expect(parseHash('#safety/warnings')).toEqual({ tab: 'safety', view: 'safety' })
    expect(parseHash('#safety')).toEqual({ tab: 'safety', view: null })
  })
})

describe('dial status', () => {
  it('LISTED and UNVERIFIED numbers are dialable, UNKNOWN is not, UNVERIFIED gets the check mark', () => {
    const mk = (id: string, status: Entry['status'], phone: string | null): Entry => ({ ...e(id, 'g', phone), status })
    const r = splitDial([mk('a', 'CONFIRMED', '1'), mk('b', 'LISTED', '2'), mk('c', 'UNVERIFIED', '3'), mk('d', 'UNKNOWN', '4'), mk('f', 'UNVERIFIED', null)])
    expect(r.groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(r.missing.map((m) => m.id)).toEqual(['d', 'f'])
    expect(needsCheck(mk('c', 'UNVERIFIED', '3'))).toBe(true)
    expect(needsCheck(mk('b', 'LISTED', '2'))).toBe(false)
    expect(CHECK_LABEL).toBe('number not yet confirmed')
  })
})

describe('planDial: one local set by place', () => {
  const rows = hotlines as Entry[]
  const ids = (lat: number, lon: number, gps = true) => planDial({ lat, lon }, rows, gps).sets.map((s) => s.id)
  it('inside a Philippine area: that area, then national, OFW, teleconsult', () => {
    expect(ids(7.07, 125.61)).toEqual(['davao', 'ph', 'ofw', 'tele'])
    expect(ids(10.32, 123.89)).toEqual(['cebu', 'ph', 'ofw', 'tele'])
    expect(planDial({ lat: 7.07, lon: 125.61 }, rows, true).sets[0]!.header).toBe('You are in Davao')
    expect(planDial(DAMPAS, rows, false).sets[0]!.header).toBe('Your home area is Tagbilaran')
  })
  it('shows only that area: no other city numbers', () => {
    const davao = planDial({ lat: 7.07, lon: 125.61 }, rows, true).sets.flatMap((s) => s.entries)
    expect(davao.some((x) => x.zone === 'gensan' || x.zone === 'cebu' || x.zone === 'texas')).toBe(false)
  })
  it('Philippines outside every area: national, OFW, teleconsult, and says why', () => {
    const p = planDial({ lat: 17.6, lon: 121.7 }, rows, true)
    expect(p.sets.map((s) => s.id)).toEqual(['ph', 'ofw', 'tele'])
    expect(p.note).toContain('outside our local lists')
    expect(p.noLocal).toBe(true)
  })
  it('Texas: Texas set, then OFW and teleconsult, no Philippine national', () => {
    expect(ids(29.76, -95.37)).toEqual(['texas', 'ofw', 'tele'])
  })
  it('abroad, not Texas: OFW only (plus teleconsult), a source link, and no guessed local number', () => {
    const p = planDial({ lat: 1.35, lon: 103.82 }, rows, true)
    expect(p.sets.map((s) => s.id)).toEqual(['ofw', 'tele'])
    expect(p.abroad).toBe(true)
    expect(p.sets.flatMap((s) => s.entries).some((x) => x.zone === 'ph' || x.zone === 'texas')).toBe(false)
  })
  it('an area with no entry is flagged so admins can add numbers', () => {
    expect(planDial(DAMPAS, [], false).noLocal).toBe(true)
  })
})

describe('coversHere: per-area data only where it was gathered', () => {
  it('home zone chosen: yes. GPS in the same area: yes. GPS elsewhere or abroad: no', () => {
    expect(coversHere({ weather: DAMPAS, source: 'zone', zone: 'dampas' })).toBe(true)
    expect(coversHere({ weather: { lat: 9.65, lon: 123.86 }, source: 'gps', zone: 'dampas' })).toBe(true)
    expect(coversHere({ weather: { lat: 7.07, lon: 125.61 }, source: 'gps', zone: 'conel' })).toBe(false)
    expect(coversHere({ weather: { lat: 29.76, lon: -95.37 }, source: 'gps-abroad', zone: 'dampas' })).toBe(false)
  })
})
