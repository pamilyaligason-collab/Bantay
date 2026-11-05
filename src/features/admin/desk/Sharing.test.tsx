import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn(), link: vi.fn(), unlink: vi.fn(), member: vi.fn() }))
const people = [
  { id: 'pm', display_name: 'Mama', auth_user_id: 'um', photo_path: null },
  { id: 'pp', display_name: 'Papa', auth_user_id: 'up', photo_path: null },
  { id: 'pj', display_name: 'Ate Joy', auth_user_id: 'uj', photo_path: null },
  { id: 'pk', display_name: 'Baby Kai', auth_user_id: null, photo_path: null },
  { id: 'px', display_name: 'Archived Ann', auth_user_id: 'ux', photo_path: null, archived_at: '2026-10-01T00:00:00Z' }
]
vi.mock('./people', () => ({ useDeskPeople: () => ({ people, error: false, reload: () => undefined, nameOf: () => '' }) }))
vi.mock('../api', () => ({ rpc: h.rpc, linkCarer: h.link, unlinkCarer: h.unlink }))
vi.mock('../../auth/session', () => ({ getMember: h.member }))
import Sharing, { cellOf, type GridRow } from './Sharing'

const row = (o: Partial<GridRow>): GridRow => ({ person_id: 'pm', person_name: 'Mama', carer_user_id: 'up', carer_name: 'Papa', can_write: false, pending: false, ...o })
const grid: GridRow[] = [
  row({}), // Papa sees Mama
  row({ carer_user_id: 'uj', carer_name: 'Ate Joy', pending: true }), // a leftover offer from before 0046: not a link
  row({ person_id: 'pk', person_name: 'Baby Kai', carer_user_id: 'uj', carer_name: 'Ate Joy', can_write: true }) // Ate Joy is the carer of Baby Kai
]
const [mama, papa, joy, kai] = people as [typeof people[0], typeof people[0], typeof people[0], typeof people[0]]

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ ok: true, data: grid })
  h.link.mockReset().mockResolvedValue({ ok: true, data: 'added' })
  h.member.mockReset().mockResolvedValue({ userId: 'u0', personId: null, role: 'admin', handle: null, isOwner: true })
  h.unlink.mockReset().mockResolvedValue({ ok: true, data: null })
})
afterEach(cleanup)
/** The box once the owner check has answered (boxes are off until then). */
const ready = async (name: string) => { const b = (await screen.findByRole('button', { name })) as HTMLButtonElement; await waitFor(() => expect(b.disabled).toBe(false)); return b }

describe('cellOf', () => {
  it('self, none, view and carer; a leftover pending offer is not a link', () => {
    expect(cellOf(grid, mama, mama)).toBe('self')
    expect(cellOf(grid, mama, papa)).toBe('view')
    expect(cellOf(grid, mama, joy)).toBe('none')
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
    expect(screen.getByRole('button', { name: 'Ate Joy does not see Mama' }).textContent).toBe('')
    await waitFor(() => expect(document.body.textContent).toMatch(/Tap an empty box to allow \(it asks first\), a filled box to stop. Allow tells the person, or the new viewer if the person has no login. Stop tells the viewer. You always see everyone./))
    expect((screen.getByRole('button', { name: 'Mama is the person Mama' }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.textContent).toMatch(/Tap an empty box to allow \(it asks first\), a filled box to stop\. Allow tells the person, or the new viewer if the person has no login\. Stop tells the viewer\. You always see everyone\./)
    expect(document.body.textContent).toMatch(/Only the family owner can change this page\./)
    expect(document.body.textContent).not.toMatch(/waiting|accept|Admins can see records/i)
  })
  it('the shared family account is neither a column nor a row, so no tap can fail on it', async () => {
    people.push({ id: 'ps', display_name: 'Shared Home', auth_user_id: 'us', photo_path: null, kind: 'shared' } as (typeof people)[0])
    try {
      render(<Sharing id={null} />)
      const t = await screen.findByRole('table')
      expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Records of', 'Mama', 'Papa', 'Ate Joy'])
      expect(within(t).queryByRole('rowheader', { name: 'Shared Home' })).toBeNull()
    } finally { people.pop() }
  })
  it('the owner is not a column (they see everyone without a link) but their own records are still a row', async () => {
    h.member.mockResolvedValue({ userId: 'up', personId: 'pp', role: 'admin', handle: null, isOwner: true }) // Papa is the owner here
    render(<Sharing id={null} />)
    const t = await screen.findByRole('table')
    await waitFor(() => expect(within(t).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Records of', 'Mama', 'Ate Joy']))
    expect(within(t).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Mama', 'Papa', 'Ate Joy', 'Baby Kai'])
  })
  it('Allow asks first: one tap makes no link, Cancel makes none, Allow makes it, then the grid reloads', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await ready('Ate Joy does not see Papa'))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText("Let Ate Joy see Papa's records? Papa will be told.")).toBeTruthy()
    expect(h.link).not.toHaveBeenCalled() // one tap is not enough
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(h.link).not.toHaveBeenCalled() // cancelling makes no link
    fireEvent.click(await ready('Ate Joy does not see Papa'))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith('uj', 'pp', false))
    expect(await screen.findByText("Ate Joy can now see Papa's records.")).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Selected' })).toBeNull()
    expect(h.rpc).toHaveBeenCalledTimes(2) // reloaded after the change
  })
  it('Allow names who is told: the person if they have a login, else the new viewer', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await ready('Papa does not see Baby Kai'))
    const dlg = await screen.findByRole('alertdialog')
    expect(within(dlg).getByText("Let Papa see Baby Kai's records? Papa will be told.")).toBeTruthy() // Baby Kai has no login
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }))
  })
  it('a read-only admin (not the owner) sees the grid and every box is off', async () => {
    h.member.mockResolvedValue({ userId: 'u9', personId: null, role: 'admin', handle: null, isOwner: false })
    render(<Sharing id={null} />)
    const box = (await screen.findByRole('button', { name: 'Papa sees Mama' })) as HTMLButtonElement
    await waitFor(() => expect(h.member).toHaveBeenCalled())
    expect(box.disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Ate Joy does not see Papa' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ate Joy does not see Papa' }))
    expect(h.link).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/Tap an empty box/)
    expect(document.body.textContent).toMatch(/Only the family owner can change this page\./)
  })
  it('an error reading who the owner is leaves the grid read-only (fails closed)', async () => {
    h.member.mockRejectedValue(new Error('down'))
    render(<Sharing id={null} />)
    const box = (await screen.findByRole('button', { name: 'Ate Joy does not see Papa' })) as HTMLButtonElement
    await waitFor(() => expect(h.member).toHaveBeenCalled())
    expect(box.disabled).toBe(true)
  })
  it('a filled box opens the panel with Stop sharing and Close; the carer box is off for a person with a login', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await ready('Papa sees Mama'))
    const panel = await screen.findByRole('region', { name: 'Selected' })
    expect((within(panel).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    expect(within(panel).queryByRole('button', { name: 'Save' })).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Stop sharing' })).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Selected' })).toBeNull()
  })
  it('a person with no login can have a carer: the box is on for an existing carer and Save sends can_write', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await ready('Ate Joy is the carer of Baby Kai'))
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.disabled).toBe(false)
    expect(box.checked).toBe(true)
    h.link.mockResolvedValue({ ok: true, data: 'updated' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.link).toHaveBeenCalledWith('uj', 'pk', true))
    expect(await screen.findByText('Saved. Ate Joy is now a carer.')).toBeTruthy()
  })
  it('Save on a link removed elsewhere says it made the link again, never "Nothing changed"', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await ready('Ate Joy is the carer of Baby Kai'))
    h.link.mockResolvedValue({ ok: true, data: 'added' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Ate Joy had been removed, so the link was made again.')).toBeTruthy()
    expect(screen.queryByText('Nothing changed.')).toBeNull()
  })
  it('Stop sharing asks first and calls unlink only after Stop sharing is confirmed', async () => {
    render(<Sharing id={null} />)
    fireEvent.click(await ready('Papa sees Mama'))
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
    fireEvent.click(await ready('Ate Joy does not see Papa'))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Allow' }))
    expect(await screen.findByText('Check what you typed and try again.')).toBeTruthy()
  })
})
