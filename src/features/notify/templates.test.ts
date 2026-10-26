import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ALERT_KIND, buildNotification, HEALTH_IDS, NOTIFY_KINDS, renderTemplate, SAFETY_IDS, TEMPLATES, type TemplateId } from './templates'

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
    for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
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

describe('dose_watch (carers, M7b)', () => {
  it('builds the generic text from a first name only', () => {
    const n = buildNotification({ t: 'dose_watch', n: 'Maria' })!
    expect(n.body).toBe('Maria has not marked a medicine (2 h).')
    expect(n.cls).toBe('carer')
    expect(n.data.tab).toBe('health')
  })
  it('rejects anything else riding along or a name with digits or markup', () => {
    expect(buildNotification({ t: 'dose_watch' })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'Maria', med: 'Metformin 500 mg' })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'BP 150/95' })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: '<b>x</b>' })).toBeNull()
  })
})

describe('dose_watch names', () => {
  it('accepts ñ, a title plus name with one space, and a dot; rejects two spaces, digits and long names', () => {
    expect(buildNotification({ t: 'dose_watch', n: 'Niño' })).not.toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'Lola Rosa' })!.tag).toBe('dose_watch:Lola Rosa')
    expect(buildNotification({ t: 'dose_watch', n: 'Ma. Cruz' })).not.toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'a  b' })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'a b c' })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'Maria2' })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'A'.repeat(25) })).toBeNull()
    expect(buildNotification({ t: 'dose_watch', n: 'Maria' })!.cls).toBe('carer')
  })
})

describe('Phase 2 alert templates (D-78)', () => {
  const ALL = Object.keys(TEMPLATES) as TemplateId[]
  it('every template has a tone, and the urgent set is the one in the contract', () => {
    for (const id of ALL) expect(['urgent', 'normal'], id).toContain(TEMPLATES[id].tone)
    const urgent = ALL.filter((i) => TEMPLATES[i].tone === 'urgent').sort()
    expect(urgent).toEqual(['dose_missed', 'family_sos', 'flood_watch', 'heat_alert', 'mood_unwell', 'pin_approve', 'pin_changed', 'reading_high', 'storm_warning', 'system'])
    expect(TEMPLATES.sos_late.tone).toBe('normal')
  })
  it('the contract titles are exact', () => {
    expect(TEMPLATES.review_open.title).toBe('A medicine needs an answer')
    expect(TEMPLATES.phone_health.title).toBe('A phone may miss alarms')
    expect(TEMPLATES.reading_high.title).toBe('Please check on <name>')
    expect(TEMPLATES.mood_unwell.title).toBe('<name> is not feeling well')
    expect(TEMPLATES.digest.title).toBe("Today's family summary is ready")
    expect(TEMPLATES.pin_approve.title).toBe('Someone asks you to approve a PIN reset')
    expect(TEMPLATES.pin_changed.title).toBe('Your PIN was changed')
    expect(TEMPLATES.system.title).toBe('Bantay needs your attention (admin)')
    expect(TEMPLATES.sos_cancel.title).toBe('The SOS was cancelled')
    expect(TEMPLATES.sos_cancel.body).toBe('<name> said they are fine; open Bantay to see.')
  })
  it('a push for a name template says Someone, never a literal <name> or HH:MM', () => {
    for (const id of ALL) { const n = buildNotification({ t: id })!; expect(n.title + n.body, id).not.toMatch(/<name>|HH:MM/) }
    expect(buildNotification({ t: 'mood_unwell' })!.title).toBe('Someone is not feeling well')
    expect(buildNotification({ t: 'reading_high' })!.title).toBe('Please check on someone')
    expect(buildNotification({ t: 'sos_late' })!.title).toBe('Someone used SOS; it reached Bantay later')
  })
  it('the in-app renderer fills the name and the SOS time, and the copy never promises a lock-screen push', () => {
    expect(renderTemplate('mood_unwell', { name: 'Mama' }).title).toBe('Mama is not feeling well')
    expect(renderTemplate('reading_high', { name: 'Mama' }).title).toBe('Please check on Mama')
    expect(renderTemplate('sos_late', { name: 'Mama', time: '08:47' }).title).toBe('Mama used SOS at 08:47; it reached Bantay later')
    expect(renderTemplate('nope').title).toBe('Bantay')
    for (const id of ALL) expect(TEMPLATES[id].title + TEMPLATES[id].body, id).not.toMatch(/lock screen|will be (told|notified)/i)
  })
  it('keeps the broadcast list to the four original safety ids, all cls safety', () => {
    expect([...SAFETY_IDS].sort()).toEqual(['family_sos', 'flood_watch', 'heat_alert', 'storm_warning'])
    for (const id of SAFETY_IDS) expect(TEMPLATES[id].cls).toBe('safety')
  })
  it('ALERT_KIND maps only to kinds in the 0030 CHECK, and the CHECK lists exactly NOTIFY_KINDS (ML-28)', () => {
    const sql = readFileSync('supabase/migrations/0030_carer_alerts.sql', 'utf8')
    const m = /kind text not null check \(kind in \(([^)]*)\)\)/.exec(sql)!
    const inSql = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!)
    expect([...NOTIFY_KINDS].sort()).toEqual([...inSql].sort())
    for (const [id, kind] of Object.entries(ALERT_KIND)) { expect(NOTIFY_KINDS, id).toContain(kind); expect(Object.hasOwn(TEMPLATES, id), id).toBe(true) }
    expect(Object.keys(ALERT_KIND).sort()).toEqual(ALL.filter((i) => i !== 'dose_due' && i !== 'bp_check').sort())
  })
})
