import { describe, expect, it } from 'vitest'
import { allSet, buildRows, ORDER, rowsLeft, walk, type Facts, type Row, type RowId } from './rows'

const ALL_ON = { display: true, exact: true, battery: true }
const NONE = { display: false, exact: false, battery: false }
const base = (o: Partial<Facts> = {}): Facts => ({
  native: true, update: { kind: 'none', versionName: '2.8.0', sizeMB: 0, canInstall: true, phase: 'idle', pct: 0 }, notifSupported: true, notif: ALL_ON,
  location: 'granted', health: 'on', library: 'on', libraryMB: 178, maps: 'on', testSent: true, ...o
})
const ids = (rows: Row[]) => rows.map((r) => r.id)
const st = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, r.status]))
const READY: NonNullable<Facts['update']> = { kind: 'ready', versionName: '2.9.0', sizeMB: 15.8, canInstall: true, phase: 'idle', pct: 0 }

describe('Set up everything rows', () => {
  it('lists every step on the Android app, in the fixed order, update first and the test reminder last', () => {
    const r = buildRows(base({ testSent: false }))
    expect(ids(r)).toEqual(['update', 'notifications', 'exact', 'battery', 'location', 'health', 'library', 'maps', 'test'])
    expect(ids(r)).toEqual(ORDER)
  })
  it('a fresh phone: every step but the update needs a tap, nothing is called done', () => {
    const r = buildRows(base({ update: READY, notif: NONE, location: 'ask', health: 'off', library: 'off', maps: 'off', testSent: false }))
    expect(st(r)).toEqual({ update: 'tap', notifications: 'tap', exact: 'tap', battery: 'tap', location: 'tap', health: 'tap', library: 'tap', maps: 'tap', test: 'tap' })
    expect(rowsLeft(r)).toHaveLength(9)
    expect(allSet(r)).toBe(false)
  })
  it('everything on and the test sent is All set', () => {
    const r = buildRows(base())
    expect(Object.values(st(r)).every((s) => s === 'done')).toBe(true)
    expect(allSet(r)).toBe(true)
  })
  it('the update row follows the install permission and the running download', () => {
    const row = (u: Partial<NonNullable<Facts['update']>>) => buildRows(base({ update: { ...READY, ...u } })).find((x) => x.id === 'update')!
    expect(row({ canInstall: false })).toMatchObject({ status: 'tap', button: 'Open Settings' })
    expect(row({})).toMatchObject({ status: 'tap', button: 'Get the update' })
    expect(row({ phase: 'downloading', pct: 40 })).toMatchObject({ status: 'tap', button: 'Downloading 40%', disabled: true })
    expect(row({ phase: 'waiting_wifi' })).toMatchObject({ disabled: true })
    expect(row({ phase: 'pending' })).toMatchObject({ status: 'tap', disabled: true })
    expect(row({ phase: 'error' })).toMatchObject({ button: 'Try again' })
    expect(row({ kind: 'none' })).toMatchObject({ status: 'done' })
  })
  it('an unknown install permission (null) is not read as a refusal', () => {
    expect(buildRows(base({ update: { ...READY, canInstall: null } })).find((x) => x.id === 'update')!.button).toBe('Get the update')
  })
  it('exact alarms and the battery switch each follow their own state', () => {
    const r = buildRows(base({ notif: { display: true, exact: false, battery: true } }))
    expect(st(r)).toMatchObject({ notifications: 'done', exact: 'tap', battery: 'done' })
  })
  it('a phone without Health Connect shows the row as not available, and it does not block All set', () => {
    const r = buildRows(base({ health: 'unavailable' }))
    expect(st(r).health).toBe('na')
    expect(allSet(r)).toBe(true)
  })
  it('location denied sends the person to Settings; unsupported is not available', () => {
    expect(buildRows(base({ location: 'denied' })).find((x) => x.id === 'location')).toMatchObject({ status: 'tap', button: 'Open Settings' })
    expect(st(buildRows(base({ location: 'unsupported' }))).location).toBe('na')
  })
  it('the test reminder waits for notifications', () => {
    const r = buildRows(base({ notif: NONE, testSent: false })).find((x) => x.id === 'test')!
    expect(r).toMatchObject({ status: 'tap', disabled: true })
    expect(buildRows(base({ testSent: false })).find((x) => x.id === 'test')!.disabled).toBe(false)
  })
  it('features not in this build are left out: no library, no maps', () => {
    expect(ids(buildRows(base({ library: 'none', maps: 'none' })))).not.toContain('library')
    expect(ids(buildRows(base({ library: 'none', maps: 'none' })))).not.toContain('maps')
  })
  it('web shows only the rows that apply: no update, alarms, battery, health or test', () => {
    const r = buildRows(base({ native: false, update: null, health: 'unavailable', notif: { display: false, exact: true, battery: true }, location: 'ask' }))
    expect(ids(r)).toEqual(['notifications', 'location', 'library', 'maps'])
    expect(r[0]!.say).toMatch(/browser/)
  })
  it('a browser without notifications says so instead of offering a button', () => {
    expect(buildRows(base({ native: false, update: null, notifSupported: false })).find((x) => x.id === 'notifications')).toMatchObject({ status: 'na' })
  })
})

describe('Do all walk', () => {
  const sim = (start: Partial<Facts>, answer: (id: RowId, f: Facts) => Partial<Facts> | null) => {
    let f = base(start)
    const acted: RowId[] = []
    return {
      acted,
      run: () => walk(buildRows(f), async () => buildRows(f), async (id) => { acted.push(id); const p = answer(id, f); if (p) f = { ...f, ...p } })
    }
  }
  it('runs the steps in order and finishes when every prompt is answered', async () => {
    const s = sim({ notif: NONE, location: 'ask', health: 'off', testSent: false }, (id, f) => ({
      notifications: { notif: { ...f.notif, display: true } },
      exact: { notif: { ...f.notif, exact: true } },
      battery: { notif: { ...f.notif, battery: true } },
      location: { location: 'granted' as const },
      health: { health: 'on' as const },
      test: { testSent: true }
    } as Partial<Record<RowId, Partial<Facts>>>)[id] ?? null)
    expect(await s.run()).toBeNull()
    expect(s.acted).toEqual(['notifications', 'exact', 'battery', 'location', 'health', 'test'])
  })
  it('stops at the step still waiting for the person and leaves the later ones alone', async () => {
    const s = sim({ notif: NONE, location: 'ask' }, (id, f) => (id === 'notifications' ? { notif: { ...f.notif, display: true } } : null)) // exact stays off: the Settings switch is not flipped yet
    expect(await s.run()).toBe('exact')
    expect(s.acted).toEqual(['notifications', 'exact'])
  })
  it('does nothing when nothing needs a tap', async () => {
    const s = sim({}, () => null)
    expect(await s.run()).toBeNull()
    expect(s.acted).toEqual([])
  })
  it('a download that carries on by itself does not hold up the other steps', async () => {
    const s = sim({ update: READY, location: 'ask' }, (id, f) => (id === 'update' ? { update: { ...READY, phase: 'downloading', pct: 3 } } : id === 'location' ? { location: 'granted' as const } : (f && null)))
    expect(await s.run()).toBeNull()
    expect(s.acted).toEqual(['update', 'location'])
  })
  it('a disabled step is not run before the step it waits for', async () => {
    const s = sim({ notif: NONE, testSent: false }, (id, f) => (id === 'notifications' ? { notif: { ...f.notif, display: true } } : id === 'exact' ? { notif: { ...f.notif, exact: true } } : id === 'battery' ? { notif: { ...f.notif, battery: true } } : id === 'test' ? { testSent: true } : null))
    expect(await s.run()).toBeNull()
    expect(s.acted).toEqual(['notifications', 'exact', 'battery', 'test'])
  })
})
