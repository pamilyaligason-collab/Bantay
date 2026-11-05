import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/session', () => ({ getMember: async () => null, getAccessToken: async () => 'tok', onAuthChange: () => () => undefined }))
import { hdb } from '../records/store'
import ViewAsBanner from './ViewAsBanner'
import { getActingPersonId, setActing } from './store'

const can = (log: boolean, reason: string | null) => ({ log, edit: true, rollcall: log, mood: log, reason })
const act = (c: ReturnType<typeof can>) => setActing({ personId: 'p-mama', name: 'Mama', can: c })

beforeEach(async () => { setActing(null); location.hash = '#today'; await hdb.people.clear(); await hdb.people.put({ id: 'p-mama', name: 'Mama Villar' }) })
afterEach(() => { cleanup(); setActing(null) })

describe('ViewAsBanner (D-125)', () => {
  it('can log: Viewing as, the logging line, Back to me', () => {
    act(can(true, null))
    render(<ViewAsBanner />)
    const bar = screen.getByTestId('viewas-bar')
    expect(bar.textContent).toContain('Viewing as Mama')
    expect(bar.textContent).toContain('You can log for Mama. Entries show you logged them.')
    expect(within(bar).queryByRole('button', { name: 'Exit' })).toBeNull() // the old label is gone
  })
  it('cannot log: Look only plus the reason', () => {
    act(can(false, 'Mama has their own login, so only Mama can log.'))
    render(<ViewAsBanner />)
    expect(screen.getByTestId('viewas-bar').textContent).toContain('Look only. Mama has their own login, so only Mama can log.')
  })
  it("Back to me on a tab stays on the tab; on that person's member page it goes to Today", () => {
    act(can(true, null)); location.hash = '#discover'
    render(<ViewAsBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to me' }))
    expect(getActingPersonId()).toBeNull()
    expect(location.hash).toBe('#discover')
    act(can(true, null)); location.hash = '#health/member/p-mama'
    cleanup(); render(<ViewAsBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to me' }))
    expect(location.hash).toBe('#today')
  })
  it("Back to me on that person's sharing list (#sharing/<id>) goes to Today too; someone else's list stays", () => {
    act(can(true, null)); location.hash = '#sharing/p-mama'
    render(<ViewAsBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to me' }))
    expect(location.hash).toBe('#today')
    cleanup(); act(can(true, null)); location.hash = '#sharing/p-other'
    render(<ViewAsBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to me' }))
    expect(location.hash).toBe('#sharing/p-other')
  })
  it("a member page of someone else is left alone", () => {
    act(can(true, null)); location.hash = '#health/member/p-other'
    render(<ViewAsBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to me' }))
    expect(location.hash).toBe('#health/member/p-other')
  })
})
