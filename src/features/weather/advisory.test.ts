import { describe, expect, it } from 'vitest'
import type { Alert } from '../safety/alerts'
import { hasAdvisory } from './advisory'

const NOW = Date.parse('2026-11-05T04:00:00Z')
const row = (o: Partial<Alert>) => ({ id: 'x', kind: 'gdacs', level: null, title: 'Sample', what: '', where: '', when: '', doNow: '', source: '', sourceUrl: null, issuedAt: '2026-11-05T01:00:00Z', lat: null, lon: null, bulletin: '', ...o }) as Alert

describe('hasAdvisory (D-125)', () => {
  it('no rows: no advisory', () => expect(hasAdvisory([], NOW)).toBe(false))
  it('a listed storm: advisory', () => expect(hasAdvisory([row({ id: 'gdacs-TC-1' })], NOW)).toBe(true))
  it('a stale storm row is hidden by cyclones(), so no advisory', () => expect(hasAdvisory([row({ id: 'gdacs-TC-1', stale: true })], NOW)).toBe(false))
  it('a signal only (no storm row): advisory', () => expect(hasAdvisory([row({ id: 's', kind: 'tcws', level: 'Signal No. 2' })], NOW)).toBe(true))
  it('a signal older than 24 h or without a level: no advisory', () => {
    expect(hasAdvisory([row({ id: 's', kind: 'tcws', level: 'Signal No. 2', issuedAt: '2026-11-04T03:00:00Z' })], NOW)).toBe(false)
    expect(hasAdvisory([row({ id: 's', kind: 'tcws', level: null })], NOW)).toBe(false)
  })
  it('an unrelated alert (a quake) is not a storm advisory', () => expect(hasAdvisory([row({ id: 'q', kind: 'quake' })], NOW)).toBe(false))
})
