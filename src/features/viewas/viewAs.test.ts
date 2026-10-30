import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  member: { userId: 'u-admin', personId: 'p-admin', role: 'admin' as 'admin' | 'member', handle: null as string | null } as { userId: string; personId: string | null; role: 'admin' | 'member'; handle: string | null } | null,
  log: vi.fn(), carers: vi.fn(), calls: [] as string[]
}))
vi.mock('../auth/session', () => ({ getMember: async () => h.member, onAuthChange: () => () => undefined }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.member?.personId ?? null }))
vi.mock('../admin/events', () => ({ track: async (k: string, n: string) => { h.calls.push(`${k}:${n}`); return true } }))
vi.mock('../admin/desk/viewAsData', () => ({ logViewAs: (...a: unknown[]) => h.log(...a), loadRoster: async () => null, visibleTo: () => ({ shown: [], hidden: [] }) }))
vi.mock('../admin/api', () => ({ listCarers: () => h.carers() }))
import { hdb } from '../records/store'
import { enterActing, exitActing, useActing, useActingCan, useActingPersonId, useViewedVisibleIds } from './viewAs'
import { getActingPersonId } from './store'

const link = (can_write: boolean) => ({ ok: true, data: [{ carer_id: 'u-admin', person_id: 'p-mama', can_write }] })

beforeEach(async () => {
  exitActing()
  h.member = { userId: 'u-admin', personId: 'p-admin', role: 'admin', handle: null }
  h.log.mockReset(); h.log.mockResolvedValue(true); h.carers.mockReset(); h.carers.mockResolvedValue(link(true)); h.calls = []
  await hdb.people.clear(); await hdb.people.put({ id: 'p-mama', name: 'Mama Roco' })
})
afterEach(() => { exitActing() })

describe('enterActing', () => {
  it('a person with no people row on this phone is refused before any audit row is written', async () => {
    expect(await enterActing('p-cache-only')).toBe(false)
    expect(h.log).not.toHaveBeenCalled()
    expect(getActingPersonId()).toBeNull()
  })
  it('a member (not admin) cannot enter and no audit row is written', async () => {
    h.member = { userId: 'u-m', personId: 'p-m', role: 'member', handle: null }
    expect(await enterActing('p-mama')).toBe(false)
    expect(h.log).not.toHaveBeenCalled()
    expect(getActingPersonId()).toBeNull()
  })
  it('signed out cannot enter', async () => {
    h.member = null
    expect(await enterActing('p-mama')).toBe(false)
  })
  it('the admin cannot act as themselves: false and no audit row (r3-4)', async () => {
    expect(await enterActing('p-admin')).toBe(false)
    expect(h.log).not.toHaveBeenCalled()
    expect(getActingPersonId()).toBeNull()
  })
  it('offline: false, nothing written (needs internet to switch)', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await enterActing('p-mama')).toBe(false)
    expect(h.log).not.toHaveBeenCalled()
    online.mockRestore()
  })
  it('waits for the audit RPC: while it is pending nothing is acting; a failed audit means never acting', async () => {
    let done!: (v: boolean) => void
    h.log.mockReturnValue(new Promise<boolean>((r) => { done = r }))
    const p = enterActing('p-mama')
    await new Promise((r) => setTimeout(r, 20))
    expect(getActingPersonId()).toBeNull()
    done(false)
    expect(await p).toBe(false)
    expect(getActingPersonId()).toBeNull()
  })
  it('after the audit row: true, one RPC call with the person, acting id set, track acting_enter', async () => {
    expect(await enterActing('p-mama')).toBe(true)
    expect(h.log).toHaveBeenCalledTimes(1)
    expect(h.log).toHaveBeenCalledWith('p-mama')
    expect(getActingPersonId()).toBe('p-mama')
    expect(h.calls).toContain('action:acting_enter')
  })
  it('exit clears it and tracks acting_exit; a mounted hook re-renders to the signed-in person', async () => {
    const { result } = renderHook(() => ({ id: useActingPersonId(), a: useActing() }))
    await waitFor(() => expect(result.current.id).toBe('p-admin'))
    await act(async () => { await enterActing('p-mama') })
    expect(result.current.id).toBe('p-mama')
    expect(result.current.a).toEqual({ acting: true, personId: 'p-mama', name: 'Mama' })
    act(() => exitActing())
    expect(result.current.id).toBe('p-admin')
    expect(result.current.a.acting).toBe(false)
    expect(h.calls).toContain('action:acting_exit')
  })
  it('an Exit that happens while the audit RPC is pending cancels the enter', async () => {
    let done!: (v: boolean) => void
    h.log.mockReturnValue(new Promise<boolean>((r) => { done = r }))
    const p = enterActing('p-mama')
    await new Promise((r) => setTimeout(r, 20))
    const { setActing } = await import('./store')
    setActing(null) // sign-out / exit bumps the epoch
    done(true)
    expect(await p).toBe(false)
    expect(getActingPersonId()).toBeNull()
  })
})

describe('useActingCan (computed once at enter, from carers)', () => {
  it('null when not acting', () => {
    expect(renderHook(() => useActingCan()).result.current).toBeNull()
  })
  it('a can_write carer link: log, edit, rollcall, mood all true, no reason', async () => {
    await enterActing('p-mama')
    expect(renderHook(() => useActingCan()).result.current).toEqual({ log: true, edit: true, rollcall: true, mood: true, reason: null })
  })
  it('an admin with a read-only link or none: log false, edit true (records_editor), the one reason sentence', async () => {
    for (const c of [link(false), { ok: true, data: [] }]) {
      exitActing(); h.carers.mockResolvedValue(c)
      await enterActing('p-mama')
      expect(renderHook(() => useActingCan()).result.current).toEqual({ log: false, edit: true, rollcall: false, mood: false, reason: 'You can see Mama but not log for her. Ask her (or an admin) to make you a carer with edit access.' })
    }
  })
  it('a failed carers read: every flag false with the could-not-check reason', async () => {
    h.carers.mockResolvedValue({ ok: false })
    await enterActing('p-mama')
    expect(renderHook(() => useActingCan()).result.current).toEqual({ log: false, edit: false, rollcall: false, mood: false, reason: 'Could not check your access. Exit and try again online.' })
  })
})

describe('useViewedVisibleIds', () => {
  it('null when not acting; fails closed to just the acting person when the roster cannot be read (R-3)', async () => {
    expect(renderHook(() => useViewedVisibleIds()).result.current).toBeNull()
    await enterActing('p-mama')
    const { result } = renderHook(() => useViewedVisibleIds())
    expect([...(result.current ?? [])]).toEqual(['p-mama'])
  })
})
