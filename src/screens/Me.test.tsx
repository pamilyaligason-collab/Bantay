import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
const call = vi.hoisted(() => ({ perm: vi.fn(), ask: vi.fn() }))
vi.mock('../features/sos/call', () => ({ callPermission: call.perm, requestCallPermission: call.ask }))
import Me from './Me'

const FAMILY = ['Mama', 'Papa', 'Ate Joy', 'Lolo'].map((displayName, i) => ({ personId: `p${i}`, displayName, handle: null, provider: 'pin' }))

beforeEach(async () => {
  call.perm.mockReset().mockResolvedValue('unavailable'); call.ask.mockReset()
  await db.kv.clear()
  localStorage.setItem('bantay.family', JSON.stringify(FAMILY))
})
afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.theme })

describe('Me', () => {
  it('sharing toggles start off (D-34)', async () => {
    render(<Me />)
    for (const n of ['Share readings', 'Share medicines', 'Share records', 'Share mood', 'Share live location'])
      expect((await screen.findByRole('switch', { name: n })).getAttribute('aria-checked')).toBe('false')
  })
  it('a sharing toggle is stored under share.<key>', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Share mood' }))
    expect(screen.getByRole('switch', { name: 'Share mood' }).getAttribute('aria-checked')).toBe('true')
    expect((await db.kv.get('share.mood'))?.value).toBe(true)
  })
  it('SOS contacts: two slots only, family pick fills name, phone is stored', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('button', { name: /Who gets your SOS text/ }))
    expect(await screen.findAllByLabelText(/phone number/)).toHaveLength(2) // max 2: no third slot to add
    await userEvent.selectOptions(screen.getByLabelText('Contact 1 family member'), 'Mama')
    expect((screen.getByLabelText('Contact 1 name') as HTMLInputElement).value).toBe('Mama')
    await userEvent.type(screen.getByLabelText('Contact 1 phone number'), '09171234567')
    await userEvent.type(screen.getByLabelText('Contact 2 name'), 'Tita')
    await userEvent.type(screen.getByLabelText('Contact 2 phone number'), '123')
    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(async () => expect((await db.kv.get('sos.contacts'))?.value).toEqual([
      { name: 'Mama', phone: '09171234567', personId: 'p0' }, { name: 'Tita', phone: '123' }]))
  })
  it('SOS row subtitle updates right after the picker closes', async () => {
    render(<Me />)
    const row = await screen.findByRole('button', { name: /Who gets your SOS text/ })
    expect(row.textContent).toContain('Nobody picked yet')
    await userEvent.click(row)
    await userEvent.selectOptions(await screen.findByLabelText('Contact 1 family member'), 'Mama')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Who gets your SOS text/ }).textContent).toContain('Mama'))
  })
  it('theme picker sets data-theme and system clears it', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect((await db.kv.get('look.theme'))?.value).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'System' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

describe('language toggle (M7b)', () => {
  it('shows English / Filipino, stores the choice in kv lang and reads it back', async () => {
    render(<Me />)
    const group = await screen.findByRole('group', { name: 'Language' })
    expect(document.body.textContent).toMatch(/Reminders and safety lines on this phone\. Reminders are on the Android app\./)
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Filipino' }))
    expect(screen.getByRole('button', { name: 'Filipino' }).getAttribute('aria-pressed')).toBe('true')
    expect(group).toBeTruthy()
    await waitFor(async () => expect((await db.kv.get('lang'))?.value).toBe('fil'))
  })
  it('starts on the saved language', async () => {
    await db.kv.put({ key: 'lang', value: 'fil' })
    render(<Me />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filipino' }).getAttribute('aria-pressed')).toBe('true'))
  })
  it('Simple mode comes first; Text size is saved and applied', async () => {
    render(<Me />)
    const sw = await screen.findByRole('switch', { name: 'Simple mode' })
    const share = await screen.findByRole('switch', { name: 'Share readings' })
    expect(sw.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Large' }))
    expect(document.documentElement.dataset.text).toBe('large')
    expect((await db.kv.get('look.textsize'))?.value).toBe('large')
    await userEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(document.documentElement.dataset.text).toBeUndefined()
  })
  it('hides the app version row from non-admins', async () => {
    render(<Me />)
    await screen.findByRole('switch', { name: 'Simple mode' })
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
  })
})

describe('Me rows (S6c, start-me)', () => {
  it('links to Privacy and keeps the alert list row', async () => {
    render(<Me />)
    expect((await screen.findByRole('link', { name: /Privacy/ })).getAttribute('href')).toBe('#privacy')
    expect(screen.getByRole('link', { name: /Alerts/ }).getAttribute('href')).toBe('#notif')
  })
  it('call row: hidden on the web, Allow asks once when denied, shows On when granted', async () => {
    const { unmount } = render(<Me />)
    await screen.findByRole('switch', { name: 'Simple mode' })
    expect(screen.queryByText('Hold for help can call for you')).toBeNull()
    unmount()
    call.perm.mockResolvedValue('denied'); call.ask.mockResolvedValue('granted')
    render(<Me />)
    expect(await screen.findByText(/Off\. Hold for help opens the dial screen/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(call.ask).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/^On\. Hold for help calls your first contact/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })
  it('call row steps aside when the Alarms rows already warn that Android took the permission back', async () => {
    await db.kv.put({ key: 'phone.check', value: { at: 'x', call_ok: false } })
    call.perm.mockResolvedValue('denied')
    render(<Me />)
    await screen.findByRole('switch', { name: 'Simple mode' })
    await waitFor(() => expect(call.perm).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 80)) // let the permission read and the kv read both settle
    expect(screen.queryByText('Hold for help can call for you')).toBeNull()
  })
})
