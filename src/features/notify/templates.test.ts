import { describe, expect, it } from 'vitest'
import { buildNotification, HEALTH_IDS, SAFETY_IDS, TEMPLATES } from './templates'

const HEALTH_VALUE = /\d|mmHg|\bmg\b|bpm|mg\/dL|%|kg|°/i

describe('buildNotification (B-7)', () => {
  it('health nudge templates contain no digits or units', () => {
    for (const id of HEALTH_IDS) {
      const n = buildNotification({ t: id })!
      expect(n.title + ' ' + n.body, id).not.toMatch(HEALTH_VALUE)
      expect(JSON.stringify(n.data), id).not.toMatch(/\d/)
    }
  })
  it('rejects unknown ids and free text', () => {
    expect(buildNotification({ t: 'BP is 150/95' })).toBeNull()
    expect(buildNotification({ t: '' })).toBeNull()
    expect(buildNotification(null)).toBeNull()
    expect(buildNotification('dose_due')).toBeNull()
  })
  it('rejects any extra field, so a value cannot ride along', () => {
    expect(buildNotification({ t: 'dose_due', body: 'BP 150/95' })).toBeNull()
    expect(buildNotification({ t: 'bp_check', v: 120 })).toBeNull()
    expect(buildNotification({ t: 'dose_missed', title: '8 mg missed' })).toBeNull()
    expect(buildNotification({ t: 'storm_warning', body: 'x' })).toBeNull()
  })
  it('never claims earthquake or local tsunami warning (B-1) and has no emdashes', () => {
    for (const id of [...HEALTH_IDS, ...SAFETY_IDS]) {
      const s = TEMPLATES[id].title + TEMPLATES[id].body
      expect(s).not.toMatch(/earthquake|tsunami|—/i)
    }
  })
  it('classifies and routes to a real tab', () => {
    expect(buildNotification({ t: 'dose_due' })!.cls).toBe('health')
    expect(buildNotification({ t: 'storm_warning' })!.cls).toBe('safety')
    expect(buildNotification({ t: 'storm_warning' })!.data.tab).toBe('safety')
  })
})
