import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { CALM_LINE, calmLine } from './WxLive'

const here = { lat: 10, lon: 124 } // invented place
const storm = { id: 'gdacs-TC-1', kind: 'gdacs', level: 'Orange', title: 'Tropical Cyclone SAMPLE', what: '', where: '', when: '', doNow: '', source: 'GDACS', sourceUrl: null, issuedAt: '2026-11-05T00:00:00Z', lat: 10, lon: 130, bulletin: '' } as Alert

describe('calmLine (the calm one-line card)', () => {
  it('checked, no storm, no signal: the short sentence', () => {
    expect(calmLine([], here, 'Sample Town', true, 0)).toEqual({ text: 'No storm warnings for the Philippines right now.', tone: 'calm' })
    expect(CALM_LINE).toBe('No storm warnings for the Philippines right now.')
  })
  it('not checked lately: never says no storms', () => {
    const l = calmLine([], here, 'Sample Town', false, 0)
    expect(l.tone).toBe('watch')
    expect(l.text).toContain('have not been checked lately')
  })
  it('A7: never checked says "yet", not "lately"; one wording for every card', () => {
    const l = calmLine([], here, 'Sample Town', false, 0, true)
    expect(l.tone).toBe('watch')
    expect(l.text).toBe('Storms have not been checked yet, so Bantay cannot say there are none. Check the map and PAGASA.')
    expect(l.text).not.toContain('lately')
  })
  it('a live wind signal: stormLine keeps its own sentence', () => {
    expect(calmLine([], here, 'Sample Town', true, 1).text).toMatch(/^A PAGASA wind signal is up/)
  })
  it('a listed storm: stormLine keeps its own sentence', () => {
    expect(calmLine([storm], here, 'Sample Town', true, 0).text).toMatch(/^Tropical Cyclone SAMPLE is about/)
  })
})
