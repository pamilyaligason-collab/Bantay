import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setPerson = vi.fn()
const state = { acting: false, id: 'a' as string | null, can: null as null | { log: boolean; edit: boolean; rollcall: boolean; mood: boolean; reason: string | null }, visible: null as Set<string> | null, pick: null as string | null }

vi.mock('../records/useHealthData', () => ({
  useHealthData: () => ({ people: [{ id: 'a', name: 'Admin' }, { id: 'm', name: 'Mama' }, { id: 'x', name: 'Other' }], get personId() { return state.pick ?? (state.acting ? state.id : 'a') }, ownId: 'a', member: { userId: 'u', role: 'admin' }, setPersonId: setPerson, readings: [], thresholds: [], ready: true })
}))
vi.mock('./useCanMark', async (orig) => ({ ...(await orig<typeof import('./useCanMark')>()), useWritableIds: () => [] }))
vi.mock('../viewas/viewAs', () => ({
  useActing: () => ({ acting: state.acting, personId: state.acting ? state.id : null, name: '' }),
  useActingPersonId: () => state.id,
  useActingCan: () => state.can,
  useViewedVisibleIds: () => state.visible
}))

import { useHealthPerson } from './useHealthPerson'

beforeEach(() => { setPerson.mockClear(); Object.assign(state, { acting: false, id: 'a', can: null, visible: null, pick: null }) })

describe('useHealthPerson (S16 acting)', () => {
  it('not acting: all people, an admin may edit but not mark another person\'s dose', () => {
    const { result } = renderHook(() => useHealthPerson())
    expect(result.current.people.map((p) => p.id)).toEqual(['a', 'm', 'x'])
    expect(result.current.canMark).toBe(true) // the admin's own record
    expect(result.current.acting).toBe(false)
    expect(setPerson).not.toHaveBeenCalled()
  })

  it('acting: starts on the member, lists only people the member can see, log/edit come from the acting rights; ownId stays the admin', () => {
    Object.assign(state, { acting: true, id: 'm', visible: new Set(['m']), can: { log: true, edit: false, rollcall: true, mood: true, reason: null } })
    const { result } = renderHook(() => useHealthPerson())
    expect(setPerson).toHaveBeenCalledWith('m')
    expect(result.current.people.map((p) => p.id)).toEqual(['m'])
    expect(result.current.ownId).toBe('a')
    expect(result.current.canMark).toBe(true)
    expect(result.current.canEdit).toBe(false)
  })

  it('acting without log rights: nothing can be written and the reason is passed on', () => {
    Object.assign(state, { acting: true, id: 'm', visible: new Set(['m']), can: { log: false, edit: false, rollcall: false, mood: false, reason: 'Ask her.' } })
    const { result } = renderHook(() => useHealthPerson())
    expect(result.current.canMark).toBe(false)
    expect(result.current.canEdit).toBe(false)
    expect(result.current.lockReason).toBe('Ask her.')
  })

  it('acting without log rights, another person picked: the acting lock does not apply, the admin own links decide', () => {
    Object.assign(state, { acting: true, id: 'm', pick: 'a', visible: new Set(['m', 'a']), can: { log: false, edit: false, rollcall: false, mood: false, reason: 'Ask her.' } })
    const { result } = renderHook(() => useHealthPerson())
    expect(result.current.canMark).toBe(true) // 'a' is the admin's own record
    expect(result.current.lockReason).toBe(null)
  })

  it('exit: the picker goes back to the admin\'s own record', () => {
    Object.assign(state, { acting: true, id: 'm', visible: new Set(['m']), can: { log: true, edit: true, rollcall: true, mood: true, reason: null } })
    const { rerender } = renderHook(() => useHealthPerson())
    setPerson.mockClear()
    Object.assign(state, { acting: false, id: 'a', visible: null, can: null })
    rerender()
    expect(setPerson).toHaveBeenCalledWith('a')
  })
})
