import { describe, expect, it } from 'vitest'
import { checkDue, decide, needsShell, parseLatest } from './check'
const L = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/bantay-2.0.1.apk', sha256: 'a'.repeat(64), size: 9437184, minShell: 2000000, notes: 'x' }
describe('decide', () => {
  it('newer release -> ready', () => expect(decide({ versionCode: 2000000 }, L)).toEqual({ kind: 'ready', latest: L }))
  it('same -> none', () => expect(decide({ versionCode: 2000001 }, L)).toEqual({ kind: 'none' }))
  it('shell below minShell -> required (full screen, D-50)', () => expect(decide({ versionCode: 1999999 }, L).kind).toBe('required'))
  it('web build never offers an APK', () => expect(decide({ versionCode: 0 }, L)).toEqual({ kind: 'none' }))
})
describe('parseLatest', () => {
  it('rejects a non-GitHub url or a bad hash', () => {
    expect(parseLatest({ ...L, url: 'https://evil.example/a.apk' })).toBeNull()
    expect(parseLatest({ ...L, sha256: 'xyz' })).toBeNull()
  })
  it('accepts the published shape', () => expect(parseLatest(L)).toEqual(L))
  it('rejects junk', () => { expect(parseLatest(null)).toBeNull(); expect(parseLatest('x')).toBeNull(); expect(parseLatest({ ...L, size: -1 })).toBeNull() })
})
describe('needsShell', () => {
  it('web never needs a shell', () => expect(needsShell({ versionCode: 0 }, 5)).toBe(false))
  it('old shell does', () => { expect(needsShell({ versionCode: 2000000 }, 2000001)).toBe(true); expect(needsShell({ versionCode: 2000001 }, 2000001)).toBe(false) })
})
describe('checkDue', () => {
  const H = 3600_000
  it('first time, after 6 h, or forced', () => { expect(checkDue(undefined, 10 * H)).toBe(true); expect(checkDue(0, 6 * H)).toBe(true); expect(checkDue(5 * H, 10 * H, true)).toBe(true) })
  it('not within 6 h', () => expect(checkDue(5 * H, 10 * H)).toBe(false))
  it('clock set back counts as due', () => expect(checkDue(10 * H, 5 * H)).toBe(true))
})
