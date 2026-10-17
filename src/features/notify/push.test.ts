import { describe, expect, it } from 'vitest'
import { dayKey, handlePush, type PushDeps } from './push'

function rig(start?: { day: string; count: number }) {
  let st = start
  const shown: string[] = []
  const deps: PushDeps = {
    getNudge: async () => st,
    setNudge: async (v) => { st = v },
    show: async (n) => { shown.push(n.title) }
  }
  return { deps, shown }
}
const at = (d: string) => new Date(d)

describe('handlePush caps', () => {
  it('caps health nudges at 2 per day per device', async () => {
    const { deps, shown } = rig()
    const now = at('2026-10-17T08:00:00')
    for (let i = 0; i < 5; i++) await handlePush({ t: 'dose_due' }, deps, now)
    expect(shown.length).toBe(2)
  })
  it('resets the next day', async () => {
    const { deps, shown } = rig({ day: dayKey(at('2026-10-17T08:00:00')), count: 2 })
    await handlePush({ t: 'bp_check' }, deps, at('2026-10-17T20:00:00'))
    expect(shown.length).toBe(0)
    await handlePush({ t: 'bp_check' }, deps, at('2026-10-18T08:00:00'))
    expect(shown.length).toBe(1)
  })
  it('never caps safety alerts, even after health cap is hit', async () => {
    const { deps, shown } = rig({ day: dayKey(at('2026-10-17T08:00:00')), count: 2 })
    for (let i = 0; i < 6; i++) await handlePush({ t: 'storm_warning' }, deps, at('2026-10-17T09:00:00'))
    expect(shown.length).toBe(6)
  })
  it('invalid payload shows the neutral fallback, not the raw text', async () => {
    const { deps, shown } = rig()
    await handlePush({ t: 'dose_due', body: 'BP 150/95' }, deps, at('2026-10-17T08:00:00'))
    expect(shown).toEqual(['Bantay'])
  })
})
