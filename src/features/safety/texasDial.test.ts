import { describe, expect, it } from 'vitest'
import hotlines from '../../data/safety/hotlines.json'
import { planDial } from './dial'
import { dialNumber, telHref, type Entry } from './entries'

// S30 L8 (D2): in the Texas area the Philippine numbers are dialled in international form.
const rows = hotlines as Entry[]
const HOUSTON = { lat: 29.76, lon: -95.37 }
const phone = (id: string) => rows.find((r) => r.id === id)!.phone!

describe('planDial in Texas', () => {
  it('Texas area: dial in international form, but it is NOT the "no list for this country" abroad case', () => {
    const p = planDial(HOUSTON, rows, true)
    expect(p.where).toBe('area')
    expect(p.intl).toBe(true)
    expect(p.abroad).toBe(false)
    expect(p.sets.map((s) => s.id)).toEqual(['texas', 'ofw', 'tele'])
  })
  it('another country abroad: international too, and the abroad note stays', () => {
    const p = planDial({ lat: 1.35, lon: 103.82 }, rows, true)
    expect(p.intl).toBe(true)
    expect(p.abroad).toBe(true)
  })
  it('inside the Philippines: local form, never +63', () => {
    expect(planDial({ lat: 7.07, lon: 125.61 }, rows, true).intl).toBe(false)
    expect(planDial({ lat: 17.6, lon: 121.7 }, rows, true).intl).toBe(false)
  })
  it('the OFW rows from a Texas phone: 1348 becomes +63 2 1348 and (02) 8722-1144 becomes +63 2 8722-1144; the Houston consulate stays as given', () => {
    expect(dialNumber(phone('hl-1348'), true)).toBe('+63 2 1348')
    expect(telHref(phone('hl-1348'), true)).toBe('tel:+6321348')
    expect(telHref(phone('hl-dmw'), true)).toBe('tel:+63287221144')
    expect(telHref(phone('hl-pcg-houston'), true)).toBe('tel:+13462938773')
    // from inside the Philippines the same rows stay local
    expect(telHref(phone('hl-1348'), false)).toBe('tel:1348')
    expect(telHref(phone('hl-dmw'), false)).toBe('tel:0287221144')
  })
  it('US numbers are untouched by international form', () => {
    expect(telHref('911', true)).toBe('tel:911')
    expect(telHref('988', true)).toBe('tel:988')
    expect(telHref('1-800-222-1222', true)).toBe('tel:18002221222')
  })
})
