import { describe, expect, it } from 'vitest'
import { JOBS } from '../admin/desk/systemApi'
import { inAppText, JOB_LABELS } from './inApp'

describe('inAppText system row', () => {
  it('uses the System health label for every known job and claims no more than one failed run', () => {
    for (const j of JOBS) {
      const t = inAppText({ template: 'system', ref: `${j.job}:81234` })
      expect(t.title).toBe(`${j.label} had a failed run`)
      expect(t.body).toBe('Open System health to see if it is still failing.')
    }
    for (const j of JOBS) expect(JOB_LABELS[j.job]).toBe(j.label)
  })
  it('every scheduled job in supabase cron has a label, so the banner never shows a raw id', () => {
    const cron = ['alerts-digest', 'alerts-ingest', 'da-prices', 'dose-watch', 'integrity-check', 'lotto-pcso', 'pagasa-drought', 'pagasa-warnings', 'records-extract', 'watch-feed', 'world-news', 'yt-feed']
    for (const job of cron) expect(JOB_LABELS[job], job).toBeTruthy()
    expect(inAppText({ template: 'system', ref: 'da-prices:81234' }).title).toBe('Market prices feed had a failed run')
    expect(inAppText({ template: 'system', ref: 'watch-feed:81234' }).title).toBe('Watch shelves feed had a failed run')
    expect(inAppText({ template: 'system', ref: 'pagasa-warnings:81234' }).title).toBe('PAGASA warnings feed had a failed run')
  })
  it('keeps the saved name for an unknown job', () => {
    expect(inAppText({ template: 'system', ref: 'new-job:1' }).title).toBe('new-job had a failed run')
  })
})

describe('inAppText link', () => {
  it("opens my sharing list for share_added and that person's list for share_added_carer (D-109)", () => {
    expect(inAppText({ template: 'share_added', ref: null }).href).toBe('#sharing')
    expect(inAppText({ template: 'share_added_carer', ref: null, personId: 'p1' }).href).toBe('#sharing/p1')
  })
  it('share_added_carer with no person falls back to its tab, and system goes to System health', () => {
    expect(inAppText({ template: 'share_added_carer', ref: null }).href).toMatch(/^#(?!sharing)/)
    expect(inAppText({ template: 'system', ref: 'dose-watch:1', personId: 'p1' }).href).toBe('/admin#/system')
  })
})
