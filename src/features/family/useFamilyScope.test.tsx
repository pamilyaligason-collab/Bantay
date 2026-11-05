import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const h = vi.hoisted(() => ({
  stored: [] as { id: string; name: string; kind?: string | null }[],
  fam: [] as unknown[],
  member: { isOwner: false } as { isOwner?: boolean } | 'offline',
  acting: { acting: false, personId: null as string | null, name: '' },
  visible: null as Set<string> | null,
  carerOf: [] as string[],
  authCb: null as null | ((event: string) => void)
}))
vi.mock('../records/useRecordsServer', () => ({ usePeople: () => h.stored }))
vi.mock('./roster', () => ({ useFamilyPeople: () => ({ people: h.fam, selfId: 'me' }) }))
vi.mock('../auth/session', () => ({ getMember: async () => { if (h.member === 'offline') throw new Error('offline'); return h.member } }))
vi.mock('../auth/client', () => ({ supabase: { auth: { onAuthStateChange: (cb: (e: string) => void) => { h.authCb = cb; return { data: { subscription: { unsubscribe() {} } } } } } } }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => h.acting, useViewedVisibleIds: () => h.visible }))
vi.mock('./reportData', () => ({ carerUserId: async () => 'u1', loadCarerOf: async () => h.carerOf }))
import { db } from '../../db'
import { resetFamilyScope, useFamilyScope, useLinkedPeople } from './useFamilyScope'

const all = [person('me', 'Rey Villar', true), person('ma', 'Ma Villar'), person('pa', 'Papa Villar'), person('ti', 'Tita Villar')]
const ids = (r: { id: string }[]) => r.map((p) => p.id)
beforeEach(() => {
  resetFamilyScope()
  h.fam = all
  h.stored = all.map(({ id, name }) => ({ id, name }))
  h.member = { isOwner: false }
  h.acting = { acting: false, personId: null, name: '' }
  h.visible = null
  h.carerOf = []
  location.hash = '#family'
})
afterEach(() => { location.hash = '' })

describe('useFamilyScope: who the pill lists', () => {
  it('owner: everyone this phone can read, and isOwner true', async () => {
    h.member = { isOwner: true }
    const { result } = renderHook(() => useFamilyScope())
    expect(ids(result.current.options)).toEqual(['me', 'ma', 'pa', 'ti'])
    await waitFor(() => expect(result.current.isOwner).toBe(true))
    expect(result.current.selectedId).toBeNull()
    expect(result.current.shown.id).toBe('me')
  })
  it('member or carer: only the rows RLS lets this phone read; names cached at sign-in never list anyone', async () => {
    h.stored = [{ id: 'me', name: 'Rey Villar' }, { id: 'ma', name: 'Ma Villar' }] // the sign-in list (h.fam) still names pa and ti
    const { result } = renderHook(() => useFamilyScope())
    expect(ids(result.current.options)).toEqual(['me', 'ma'])
    await waitFor(() => expect(result.current.isOwner).toBe(false))
  })
  it('a plain admin is not the owner and lists the same rows (shortcut: no such login exists, plan 3.3 A)', async () => {
    h.member = { isOwner: false }
    h.stored = [{ id: 'me', name: 'Rey Villar' }, { id: 'ti', name: 'Tita Villar' }]
    const { result } = renderHook(() => useFamilyScope())
    expect(ids(result.current.options)).toEqual(['me', 'ti'])
    expect(result.current.isOwner).toBe(false)
  })
  it('the shared family account is left out; a null kind (before 0046) is a person', () => {
    h.stored = [{ id: 'me', name: 'Rey Villar', kind: null }, { id: 'ma', name: 'Ma Villar', kind: 'shared' }, { id: 'pa', name: 'Papa Villar', kind: null }]
    const { result } = renderHook(() => useFamilyScope())
    expect(ids(result.current.options)).toEqual(['me', 'pa'])
  })
  it('self is always shown, even before the people rows have synced', () => {
    h.stored = []
    const { result } = renderHook(() => useFamilyScope())
    expect(ids(result.current.options)).toEqual(['me'])
    expect(result.current.shown.id).toBe('me')
  })
  it('offline (the role cannot be read): not the owner, the cached rows still list', async () => {
    h.member = 'offline'
    const { result } = renderHook(() => useFamilyScope())
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.isOwner).toBe(false)
    expect(ids(result.current.options)).toEqual(['me', 'ma', 'pa', 'ti'])
  })
  it('a phone that does not know who you are yet shows nobody (id empty), never someone else', () => {
    h.fam = [person('ma', 'Ma Villar')]
    h.stored = [{ id: 'ma', name: 'Ma Villar' }]
    const { result } = renderHook(() => useFamilyScope())
    expect(result.current.shown.id).toBe('')
  })
  it('viewing as someone: they are on show and the list is who they can see', () => {
    h.acting = { acting: true, personId: 'pa', name: 'Papa' }
    h.visible = new Set(['pa', 'ma'])
    const { result } = renderHook(() => useFamilyScope())
    expect(ids(result.current.options)).toEqual(['ma', 'pa'])
    expect(result.current.selectedId).toBe('pa')
    expect(result.current.shown.id).toBe('pa')
  })
})

describe('useFamilyScope: the pick', () => {
  it('opens on Me; select puts someone on show; picking Me or a stranger goes back to Me', () => {
    const { result } = renderHook(() => useFamilyScope())
    expect(result.current.selectedId).toBeNull()
    act(() => result.current.select('ma'))
    expect(result.current.selectedId).toBe('ma')
    expect(result.current.shown.id).toBe('ma')
    act(() => result.current.select('me'))
    expect(result.current.selectedId).toBeNull()
    act(() => result.current.select('nobody'))
    expect(result.current.selectedId).toBeNull() // not in the list: ignored, Me stays
    expect(result.current.shown.id).toBe('me')
  })
  it('survives Family\'s own pages and back, clears when the hash leaves Family', () => {
    const { result } = renderHook(() => useFamilyScope())
    act(() => result.current.select('ma'))
    act(() => { location.hash = '#family/people/ma'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(result.current.selectedId).toBe('ma')
    act(() => { location.hash = '#family/plan'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(result.current.selectedId).toBe('ma')
    act(() => { location.hash = '#health'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(result.current.selectedId).toBeNull()
    act(() => { location.hash = '#family'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(result.current.selectedId).toBeNull() // opening Family again starts on Me
  })
  it('hiding the app (lock, switch) clears it, so Family opens on Me on resume; showing it again changes nothing', () => {
    const { result } = renderHook(() => useFamilyScope())
    const state = vi.spyOn(document, 'visibilityState', 'get')
    try {
      state.mockReturnValue('visible')
      act(() => result.current.select('ma'))
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(result.current.selectedId).toBe('ma') // still visible: kept
      state.mockReturnValue('hidden')
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(result.current.selectedId).toBeNull()
      expect(result.current.shown.id).toBe('me')
    } finally { state.mockRestore() }
  })
  it('sign-out clears it', () => {
    const { result } = renderHook(() => useFamilyScope())
    act(() => result.current.select('pa'))
    act(() => h.authCb?.('TOKEN_REFRESHED'))
    expect(result.current.selectedId).toBe('pa') // a token refresh is not a sign-out
    act(() => h.authCb?.('SIGNED_OUT'))
    expect(result.current.selectedId).toBeNull()
  })
  it('nothing is stored: kv and localStorage stay empty', async () => {
    await db.kv.clear()
    const { result } = renderHook(() => useFamilyScope())
    act(() => result.current.select('ma'))
    expect(result.current.selectedId).toBe('ma')
    expect(localStorage.length).toBe(0)
    expect(await db.kv.count()).toBe(0)
  })
  it('a pick whose person drops off the list (the link was removed) falls back to Me', () => {
    const { result, rerender } = renderHook(() => useFamilyScope())
    act(() => result.current.select('ma'))
    h.stored = h.stored.filter((p) => p.id !== 'ma')
    rerender()
    expect(result.current.selectedId).toBeNull()
    expect(result.current.shown.id).toBe('me')
  })
})

describe('useLinkedPeople', () => {
  it('the owner can read everyone but People, Calendar and Family health name only you and your links', async () => {
    h.member = { isOwner: true }
    h.carerOf = ['ma']
    const { result } = renderHook(() => useLinkedPeople())
    await waitFor(() => expect(ids(result.current)).toEqual(['me', 'ma']))
  })
  it('only you until the links are read', () => {
    h.carerOf = ['ma', 'pa']
    const { result } = renderHook(() => useLinkedPeople())
    expect(ids(result.current)).toEqual(['me'])
  })
  it('viewing as someone: who they can see', async () => {
    h.acting = { acting: true, personId: 'pa', name: 'Papa' }
    h.visible = new Set(['pa', 'ti'])
    const { result } = renderHook(() => useLinkedPeople())
    expect(ids(result.current)).toEqual(['pa', 'ti'])
  })
})
