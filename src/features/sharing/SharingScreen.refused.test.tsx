import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The real api.ts: only the Supabase client is faked, so an rpc error 42501 travels the whole way to the screen.
const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../auth/client', () => ({ supabase: { rpc: h.rpc } }))
vi.mock('../setup/useProfile', () => ({ useSelfPerson: () => ({ id: 'me', ready: true }), useSelfPersonId: () => 'me' }))
vi.mock('../family/CarerCards', () => ({ useCarerIds: () => [] }))
vi.mock('../auth/session', () => ({ getMember: () => Promise.resolve({ userId: 'u0', personId: 'me', role: 'admin', handle: null, isOwner: true }) }))
vi.mock('../records/useRecordsServer', () => ({ usePeople: () => [{ id: 'me', name: 'Rey Villar' }, { id: 'p-ma', name: 'Ma Villar' }] }))
import { SharingScreen } from './SharingScreen'

afterEach(() => { cleanup(); h.rpc.mockReset() })

describe('a server refusal shows the refused copy, never "No signal" or Try again', () => {
  it('person_viewers answering 42501 on a person list', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'not allowed' } })
    render(<SharingScreen person="p-ma" />)
    expect((await screen.findByRole('alert')).textContent).toBe('You cannot change that.')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Allow someone/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/No signal/)
  })
  it('share_candidates answering 42501 inside Allow someone', async () => {
    h.rpc.mockImplementation((fn: string) => Promise.resolve(fn === 'person_viewers' ? { data: [], error: null } : { data: null, error: { code: '42501', message: 'not allowed' } }))
    render(<SharingScreen person="p-ma" />)
    await userEvent.click(await screen.findByRole('button', { name: /Allow someone/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Allow someone' })
    const alert = await screen.findByText('You cannot change that.')
    expect(dlg.contains(alert)).toBe(true)
    expect(dlg.textContent).not.toMatch(/No signal|Try again/)
  })
})
