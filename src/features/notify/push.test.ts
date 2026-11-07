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

describe('carer alerts (dose_watch)', () => {
  const day = at('2026-10-17T10:00:00+08:00')
  it('are not dropped because health nudges used up the shared cap', async () => {
    const { deps, shown } = rig()
    for (let i = 0; i < 3; i++) await handlePush({ t: 'dose_due' }, deps, day)
    await handlePush({ t: 'dose_watch' }, deps, day)
    expect(shown.map((s) => s.tag)).toEqual(['dose_due', 'dose_due', 'dose_watch'])
  })
  const CARER_IDS = ['reading_high', 'mood_unwell', 'review_open', 'phone_health', 'digest', 'pin_approve', 'system', 'share_offer']
  it('have their own cap of 6 a day (distinct alerts)', async () => {
    const { deps, shown } = rig()
    for (const t of CARER_IDS) await handlePush({ t }, deps, day)
    expect(shown.length).toBe(6)
  })
  it('a re-sent push for the same tag does not use the cap again, so retries cannot silence a later different alert', async () => {
    const { deps, shown } = rig()
    for (let i = 0; i < 10; i++) await handlePush({ t: 'dose_watch' }, deps, day) // 10 retries of one dose alert: one claim, all shown (the tag replaces)
    expect(shown.length).toBe(10)
    for (const t of CARER_IDS.slice(0, 5)) await handlePush({ t }, deps, day) // 1 + 5 = 6 distinct tags: still under the cap
    expect(shown.length).toBe(15)
    await handlePush({ t: CARER_IDS[5]! }, deps, day) // the 7th distinct tag is over the cap of 6
    expect(shown.length).toBe(15)
    await handlePush({ t: 'dose_watch' }, deps, day) // an already-claimed tag still goes through
    expect(shown.length).toBe(16)
    await handlePush({ t: 'dose_watch' }, deps, at('2026-10-18T10:00:00+08:00')) // next Manila day: fresh cap
    expect((await db.kv.get('nudge.carer'))?.value).toMatchObject({ day: '2026-10-18', count: 1, tags: ['dose_watch'] })
  })
  it('a carer dose_watch uses the carer cap, not the 2 a day health cap, and shows no name', async () => {
    const { deps, shown } = rig()
    const seen: { body: string }[] = []
    const d: PushDeps = { ...deps, show: async (n) => void seen.push({ body: n.body }) }
    await handlePush({ t: 'dose_watch' }, d, day)
    expect(seen[0]!.body).toBe('A medicine was missed by someone you look after.')
    for (const t of ['reading_high', 'mood_unwell', 'review_open', 'phone_health', 'digest', 'pin_approve', 'system']) await handlePush({ t }, d, day)
    expect(seen.length).toBe(6) // MAX_CARER_PER_DAY, not MAX_NUDGES_PER_DAY
    expect((await db.kv.get('nudge'))?.value).toBeUndefined() // the health counter is untouched
    expect(shown).toEqual([])
  })
  it("the user's own dose_missed is a health nudge: capped at 2 a day, and quiet hours do not apply", async () => {
    const seen: (boolean | undefined)[] = []
    const d: PushDeps = { claimNudge, quietOn: async () => true, show: async (n) => void seen.push(n.silent) }
    for (let i = 0; i < 3; i++) await handlePush({ t: 'dose_missed' }, d, at('2026-10-17T23:00:00+08:00'))
    expect(seen).toEqual([undefined, undefined])
  })
  it('a carer dose_watch is silent in quiet hours when the setting is on, with sound otherwise', async () => {
    const seen: (boolean | undefined)[] = []
    const mk = (quiet: boolean): PushDeps => ({ claimNudge, quietOn: async () => quiet, show: async (n) => void seen.push(n.silent) })
    await handlePush({ t: 'dose_watch' }, mk(true), at('2026-10-17T23:00:00+08:00'))
    await handlePush({ t: 'dose_watch' }, mk(false), at('2026-10-17T23:00:00+08:00'))
    await handlePush({ t: 'dose_watch' }, mk(true), at('2026-10-17T12:00:00+08:00'))
    expect(seen).toEqual([true, undefined, undefined])
  })
})
