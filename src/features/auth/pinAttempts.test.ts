import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { afterFailure, loadFails, pinState, saveFails } from './pinAttempts'
const T0 = Date.parse('2026-10-18T06:00:00Z')
describe('pin attempts kept on the phone', () => {
  it('counts down tries', () => {
    let s = afterFailure(undefined, T0)
    expect(pinState(s, T0)).toEqual({ kind: 'tries', left: 4 })
    for (let i = 0; i < 3; i++) s = afterFailure(s, T0 + i)
    expect(pinState(s, T0 + 10)).toEqual({ kind: 'tries', left: 1 })
  })
  it('locks after 5 for 15 minutes from the last failure', () => {
    let s = undefined as ReturnType<typeof afterFailure> | undefined
    for (let i = 0; i < 5; i++) s = afterFailure(s, T0 + i * 1000)
    expect(pinState(s!, T0 + 5000)).toEqual({ kind: 'locked', until: T0 + 4000 + 15 * 60_000 })
    expect(pinState(s!, T0 + 4000 + 15 * 60_000 + 1)).toEqual({ kind: 'tries', left: 5 })
  })
  it('a damaged stored row counts as no failures', async () => {
    const { db } = await import('../../db')
    await db.kv.put({ key: 'pin.fail.odd', value: { lastAt: 5 } })
    expect(await loadFails('odd')).toBeUndefined()
    await saveFails('odd', { n: 2, lastAt: 7 })
    expect(await loadFails('odd')).toEqual({ n: 2, lastAt: 7 })
  })
  it('a failure after the window lapsed starts a fresh count', () => {
    const old = afterFailure(afterFailure(undefined, T0), T0 + 1)
    expect(pinState(afterFailure(old, T0 + 16 * 60_000), T0 + 16 * 60_000)).toEqual({ kind: 'tries', left: 4 })
  })
})
