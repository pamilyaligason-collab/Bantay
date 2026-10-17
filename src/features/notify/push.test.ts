import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db'
import { claimNudge, dayKey, handlePush, type PushDeps } from './push'

beforeEach(() => db.kv.clear())

function rig() {
  const shown: { title: string; tag: string }[] = []
  const deps: PushDeps = { claimNudge, show: async (n) => void shown.push({ title: n.title, tag: n.tag }) }
  return { deps, shown }
}
const at = (d: string) => new Date(d)

describe('handlePush caps', () => {
  it('caps health nudges at 2 per day per device', async () => {
    const { deps, shown } = rig()
    for (let i = 0; i < 5; i++) await handlePush({ t: 'dose_due' }, deps, at('2026-10-17T08:00:00+08:00'))
    expect(shown.length).toBe(2)
  })
  it('claims are atomic under concurrency', async () => {
    const { deps, shown } = rig()
    await Promise.all(Array.from({ length: 8 }, () => handlePush({ t: 'bp_check' }, deps, at('2026-10-17T08:00:00+08:00'))))
    expect(shown.length).toBe(2)
  })
  it('resets the next Manila day, not the phone-timezone day', async () => {
    const { deps, shown } = rig()
    // 23:30 and 00:30 Manila are 15:30Z and 16:30Z: same UTC day, different Manila days.
    for (let i = 0; i < 3; i++) await handlePush({ t: 'bp_check' }, deps, at('2026-10-17T15:30:00Z'))
    expect(shown.length).toBe(2)
    await handlePush({ t: 'bp_check' }, deps, at('2026-10-17T16:30:00Z'))
    expect(shown.length).toBe(3)
    expect(dayKey(at('2026-10-17T16:30:00Z'))).toBe('2026-10-18')
  })
  it('never caps safety alerts, even after the health cap is hit', async () => {
    const { deps, shown } = rig()
    const now = at('2026-10-17T08:00:00+08:00')
    for (let i = 0; i < 3; i++) await handlePush({ t: 'dose_due' }, deps, now)
    for (let i = 0; i < 6; i++) await handlePush({ t: 'storm_warning' }, deps, now)
    expect(shown.length).toBe(8)
  })
  it('unknown payload shows the neutral fallback with its own tag', async () => {
    const { deps, shown } = rig()
    await handlePush({ t: 'nope' }, deps)
    await handlePush(undefined, deps)
    expect(shown).toEqual([{ title: 'Bantay', tag: 'bantay' }, { title: 'Bantay', tag: 'bantay' }])
  })
  it('malformed payload naming a health id is dropped, not shown', async () => {
    const { deps, shown } = rig()
    await handlePush({ t: 'dose_due', body: 'BP 150/95' }, deps)
    expect(shown).toEqual([])
  })
})
