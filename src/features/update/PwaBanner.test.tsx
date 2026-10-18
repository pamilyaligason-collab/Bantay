import { describe, expect, it } from 'vitest'
import { bannerSteps, shouldShowPwaBanner } from './PwaBanner'

describe('shouldShowPwaBanner', () => {
  it('Android installed web app -> yes', () => expect(shouldShowPwaBanner({ standalone: true, ua: 'Linux; Android 15', native: false })).toBe(true))
  it('iPhone -> never', () => expect(shouldShowPwaBanner({ standalone: true, ua: 'iPhone OS 18_0', native: false })).toBe(false))
  it('inside the APK -> never', () => expect(shouldShowPwaBanner({ standalone: true, ua: 'Android 15', native: true })).toBe(false))
  it('browser tab -> no', () => expect(shouldShowPwaBanner({ standalone: false, ua: 'Android 15', native: false })).toBe(false))
  it('hidden for 24 h after Later', () => {
    const now = 1_000_000_000
    const o = { standalone: true, ua: 'Android 15', native: false, now }
    expect(shouldShowPwaBanner({ ...o, laterAt: now - 23 * 3600_000 })).toBe(false)
    expect(shouldShowPwaBanner({ ...o, laterAt: now - 25 * 3600_000 })).toBe(true)
  })
})

describe('bannerSteps', () => {
  it('step 3 is held while entries wait', () => {
    const s = bannerSteps(3)
    expect(s.saved).toBe('3 entries still waiting, connect to send')
    expect(s.removeEnabled).toBe(false)
  })
  it('all saved when the outbox is empty', () => {
    const s = bannerSteps(0)
    expect(s.saved).toBe('All saved to the family account')
    expect(s.removeEnabled).toBe(true)
  })
  it('unknown count never enables step 3', () => expect(bannerSteps(null).removeEnabled).toBe(false))
  it('singular', () => expect(bannerSteps(1).saved).toBe('1 entry still waiting, connect to send'))
})
