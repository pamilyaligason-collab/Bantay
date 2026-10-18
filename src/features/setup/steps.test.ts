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
  it('needs display, exact alarms (plugin status granted) and battery all on', () => {
    expect(notifyDone({ display: true, exact: exactOk('granted'), battery: true })).toBe(true)
    expect(notifyDone({ display: true, exact: exactOk('denied'), battery: true })).toBe(false)
  })
})
