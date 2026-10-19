import { describe, expect, it } from 'vitest'
import { splitDial } from './dial'
import type { Entry } from './entries'
import { hazardsFor, hazardStatus, toneOf } from './hazardCards'
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
    expect(hazardStatus(v)).toBe('Earthquake: Prone, Intensity VIII')
    expect(hazardsFor('conel')).toBeNull()
    expect(hazardStatus(null)).toBe('Not checked for this place yet')
  })
})

describe('safety sub routes', () => {
  it('keeps the Safety tab lit', () => {
    expect(parseHash('#safety/warnings')).toEqual({ tab: 'safety', view: 'safety' })
    expect(parseHash('#safety')).toEqual({ tab: 'safety', view: null })
  })
})
