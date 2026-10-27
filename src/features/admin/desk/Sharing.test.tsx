import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), link: vi.fn(), unlink: vi.fn() }))
const people = [
  { id: 'pm', display_name: 'Mama', auth_user_id: 'um', photo_path: null },
  { id: 'pp', display_name: 'Papa', auth_user_id: 'up', photo_path: null },
  { id: 'pj', display_name: 'Ate Joy', auth_user_id: 'uj', photo_path: null },
  { id: 'pk', display_name: 'Baby Kai', auth_user_id: null, photo_path: null },
  { id: 'px', display_name: 'Archived Ann', auth_user_id: 'ux', photo_path: null, archived_at: '2026-10-01T00:00:00Z' }
]
vi.mock('./people', () => ({ useDeskPeople: () => ({ people, error: false, reload: () => undefined, nameOf: () => '' }) }))
vi.mock('../api', () => ({ rpc: h.rpc, linkCarer: h.link, unlinkCarer: h.unlink }))
import Sharing, { cellOf, type GridRow } from './Sharing'

const row = (o: Partial<GridRow>): GridRow => ({ person_id: 'pm', person_name: 'Mama', carer_user_id: 'up', carer_name: 'Papa', can_write: false, pending: false, ...o })
const grid: GridRow[] = [
  row({}), // Papa sees Mama
  row({ carer_user_id: 'uj', carer_name: 'Ate Joy', pending: true }), // Ate Joy has an offer for Mama
  row({ person_id: 'pk', person_name: 'Baby Kai', carer_user_id: 'uj', carer_name: 'Ate Joy', can_write: true }) // Ate Joy is the carer of Baby Kai
]
const [mama, papa, joy, kai] = people as [typeof people[0], typeof people[0], typeof people[0], typeof people[0]]

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ ok: true, data: grid })
  h.link.mockReset().mockResolvedValue({ ok: true, data: 'pending' })
  h.unlink.mockReset().mockResolvedValue({ ok: true, data: null })
})
afterEach(cleanup)

describe('cellOf', () => {
  it('self, none, view, carer and pending', () => {
    expect(cellOf(grid, mama, mama)).toBe('self')
    expect(cellOf(grid, mama, papa)).toBe('view')
    expect(cellOf(grid, mama, joy)).toBe('pending')
    expect(cellOf(grid, kai, joy)).toBe('carer')
    expect(cellOf(grid, papa, joy)).toBe('none')
    expect(cellOf([], mama, papa)).toBe('none')
  })
})

describe('Who sees whom', () => {
  it('draws one row per active person and one column per active person with a login, archived people left out', async () => {
    render(<Sharing id={null} />)
    const t = await screen.findByRole('table')
    expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Records of', 'Mama', 'Papa', 'Ate Joy'])
    expect(within(t).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Mama', 'Papa', 'Ate Joy', 'Baby Kai'])
    expect(screen.getByRole('button', { name: 'Papa sees Mama' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Ate Joy has an offer waiting for Mama' }).textContent).toBe('…')
    expect(screen.getByRole('button', { name: 'Ate Joy is the carer of Baby Kai' }).textContent).toBe('C')
    expect((screen.getByRole('button', { name: 'Mama is the person Mama' }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.textContent).toMatch(/Admins can see records to help/)
  })
  it('an empty box offers; the carer box is off for a person with a login', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ate Joy does not see Papa' }))
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Offer to share' }))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith('uj', 'pp', false))
    expect(await screen.findByText('Offer sent to Ate Joy. They see nothing until they accept.')).toBeTruthy()
    expect(h.rpc).toHaveBeenCalledTimes(2) // reloaded after the change
  })
  it('a person with no login can have a carer: the box is on for an existing carer and Save sends can_write', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ate Joy is the carer of Baby Kai' }))
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.disabled).toBe(false)
    expect(box.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith('uj', 'pk', true))
  })
  it('Stop sharing asks first and calls unlink only after Stop sharing is confirmed', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Papa sees Mama' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    expect(h.unlink).not.toHaveBeenCalled()
    const dlg = await screen.findByRole('alertdialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(h.unlink).toHaveBeenCalledWith('up', 'pm'))
  })
  it('a failed load says so and never shows an empty grid as "nobody"', async () => {
    h.rpc.mockResolvedValue({ ok: false, error: 'not_admin' })
    render(<Sharing id={null} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Only an admin can do this\./)
    expect(screen.queryByRole('table')).toBeNull()
  })
  it('a refused change shows the plain reason', async () => {
    h.link.mockResolvedValue({ ok: false, error: 'bad_input' })
    render(<Sharing id={null} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ate Joy does not see Papa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Offer to share' }))
    expect(await screen.findByText('Check what you typed and try again.')).toBeTruthy()
  })
})
