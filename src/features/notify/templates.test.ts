import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
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

describe('dose_watch (carers, D-78)', () => {
  it('is the carer-class missed-dose line with no name, one tag', () => {
    const n = buildNotification({ t: 'dose_watch' })!
    expect(n.body).toBe('A medicine was missed by someone you look after.')
    expect(n.cls).toBe('carer')
    expect(n.tag).toBe('dose_watch')
    expect(n.data.tab).toBe('health')
  })
  it('n is a count: 1 to 99, collapses under the same tag', () => {
    const n = buildNotification({ t: 'dose_watch', n: 3 })!
    expect(n.body).toBe('3 medicines were missed by someone you look after.')
    expect(n.tag).toBe('dose_watch')
    expect(buildNotification({ t: 'dose_watch', n: 1 })!.body).toBe('A medicine was missed by someone you look after.')
  })
  it('rejects a name, a medicine, a non-count or anything else riding along', () => {
    for (const bad of [{ t: 'dose_watch', n: 'Maria' }, { t: 'dose_watch', n: '3' }, { t: 'dose_watch', n: 0 }, { t: 'dose_watch', n: 100 }, { t: 'dose_watch', n: 1.5 },
      { t: 'dose_watch', n: 2, med: 'Metformin 500 mg' }, { t: 'dose_watch', med: 'x' }]) expect(buildNotification(bad)).toBeNull()
  })
})

describe('Phase 2 alert templates (D-78)', () => {
  const ALL = Object.keys(TEMPLATES) as TemplateId[]
  it('every template has a tone, and the urgent set is the one in the contract', () => {
    for (const id of ALL) expect(['urgent', 'normal'], id).toContain(TEMPLATES[id].tone)
    const urgent = ALL.filter((i) => TEMPLATES[i].tone === 'urgent').sort()
    expect(urgent).toEqual(['dose_missed', 'family_sos', 'flood_watch', 'heat_alert', 'mood_unwell', 'pin_approve', 'pin_changed', 'reading_high', 'rollcall_help', 'storm_warning', 'system'])
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
    // The newest migration that restates the carer_alerts kind CHECK wins (0030, then 0037 in Phase 3).
    const dir = 'supabase/migrations'
    const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith('.down.sql')).sort()
    let inSql: string[] = []
    for (const f of files) {
      const sql = readFileSync(`${dir}/${f}`, 'utf8')
      if (!sql.includes('carer_alerts')) continue
      const m = [...sql.matchAll(/check \(kind in \(([^)]*)\)\)/g)].pop()
      if (m) inSql = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!)
    }
    // shortcut: Phase 3 kinds may run ahead of the SQL until lane A's 0037 restates the CHECK; then this list is empty and the check is exact again.
    const pending = NOTIFY_KINDS.filter((k) => !inSql.includes(k))
    expect(pending.every((k) => ['share', 'rollcall', 'kudos'].includes(k)), pending.join()).toBe(true)
    expect([...NOTIFY_KINDS].sort()).toEqual([...inSql, ...pending].sort())
    for (const [id, kind] of Object.entries(ALERT_KIND)) { expect(NOTIFY_KINDS, id).toContain(kind); expect(Object.hasOwn(TEMPLATES, id), id).toBe(true) }
    expect(Object.keys(ALERT_KIND).sort()).toEqual(ALL.filter((i) => i !== 'dose_due' && i !== 'bp_check').sort())
  })
})
