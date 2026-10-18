import { describe, expect, it } from 'vitest'
import { exactOk, notifyDone, remaining, type Probe } from './steps'
const all = (v: boolean): Probe => ({ photo: v, about: v, medicines: v, notifications: v, location: v, health: v, warnings: v, sos: v, sharing: v })
describe('remaining', () => {
  it('skips satisfied steps', () => expect(remaining({ ...all(true), notifications: false, warnings: false }, 'android')).toEqual(['notifications', 'warnings']))
  it('iPhone never gets Health Connect', () => expect(remaining(all(false), 'ios')).not.toContain('health'))
  it('one source for counts (A-28)', () => {
    const r = remaining({ ...all(true), sos: false }, 'android')
    expect(r.length).toBe(1)
  })
})

describe('notifications step on Android', () => {
  const ua = (v: number) => `Mozilla/5.0 (Linux; Android ${v}; Pixel) Chrome/120 Mobile Safari/537.36`
  it('is satisfied when display, exact alarms and battery are all on', () => {
    expect(notifyDone({ display: true, exact: exactOk(ua(14), 'granted'), battery: true })).toBe(true)
  })
  it('is not satisfied while exact alarms are denied (default on Android 14)', () => {
    expect(notifyDone({ display: true, exact: exactOk(ua(14), 'denied'), battery: true })).toBe(false)
  })
  it('exact alarms count as granted below API 31 (Android 11 and older)', () => {
    expect(exactOk(ua(11), 'denied')).toBe(true)
    expect(exactOk(ua(12), 'denied')).toBe(false)
  })
})
