import { describe, expect, it } from 'vitest'
import { ALERT_DEFAULTS, readPrefs, URGENT_TEXT } from './prefs'

describe('alert prefs', () => {
  it('has the agreed defaults', () => {
    expect(ALERT_DEFAULTS).toEqual({ nearFamily: true, phWide: true, worldDigest: true, macro: false, digestTime: '07:00', quiet: true, push: true, sms: false })
  })
  it('defines urgent in plain words', () => {
    for (const w of ['tsunami warning', 'wind signal 3', 'M6', 'red', 'volcano level 3']) expect(URGENT_TEXT).toContain(w)
  })
  it('readPrefs fills gaps and ignores bad values', () => {
    expect(readPrefs(undefined)).toEqual(ALERT_DEFAULTS)
    expect(readPrefs({ sms: true })).toEqual({ ...ALERT_DEFAULTS, sms: true })
    expect(readPrefs({ phWide: 'no', digestTime: 7, junk: 1 })).toEqual(ALERT_DEFAULTS)
    expect(readPrefs('x')).toEqual(ALERT_DEFAULTS)
  })
})
