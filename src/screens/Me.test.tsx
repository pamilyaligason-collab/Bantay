import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
const call = vi.hoisted(() => ({ perm: vi.fn(), ask: vi.fn() }))
vi.mock('../features/sos/call', () => ({ callPermission: call.perm, requestCallPermission: call.ask }))
import Me from './Me'

const FAMILY = ['Mama', 'Papa', 'Ate Joy', 'Lolo'].map((displayName, i) => ({ personId: `p${i}`, displayName, handle: null, provider: 'pin' }))
const at = (hash: string) => { location.hash = hash; return render(<Me />) }
const rowsOf = (root: HTMLElement) => Array.from(root.querySelectorAll('.st-row')).map((r) => r.querySelector('b')?.textContent)

beforeEach(async () => {
  call.perm.mockReset().mockResolvedValue('unavailable'); call.ask.mockReset()
  await db.kv.clear()
  localStorage.setItem('bantay.family', JSON.stringify(FAMILY))
})
afterEach(() => { cleanup(); localStorage.clear(); location.hash = ''; delete document.documentElement.dataset.theme; delete document.documentElement.dataset.text })

describe('Settings overview (#me)', () => {
  it('titles the page Settings and puts Simple mode before the group rows', async () => {
    const { container } = at('#me')
    expect((await screen.findByRole('heading', { name: 'Settings' })).textContent).toBe('Settings')
    const sw = screen.getByRole('switch', { name: 'Simple mode' })
    expect(sw.compareDocumentPosition(container.querySelector('.st-list')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('every group is one row that opens its own hash; Privacy keeps its screen (A-3, N-5)', async () => {
    const { container } = at('#me')
    await screen.findByRole('switch', { name: 'Simple mode' })
    const list = container.querySelector('.st-list') as HTMLElement
    const hrefs = Array.from(list.querySelectorAll('a')).map((a) => [a.querySelector('b')?.textContent, a.getAttribute('href')])
    expect(hrefs).toEqual([
      ['Alerts and reminders', '#me/alerts'], ['Display', '#me/display'], ['Family and sharing', '#me/family'], ['Phone', '#me/phone'],
      ['Privacy', '#privacy'], ['Sign-in', '#me/signin'], ['About', '#me/about']
    ])
  })
  it('the Display row says the three current values on one line', async () => {
    await db.kv.put({ key: 'look.textsize', value: 'large' }); await db.kv.put({ key: 'look.theme', value: 'dark' })
    at('#me')
    expect(await screen.findByText('Text Large · Theme Dark · English')).toBeTruthy()
  })
  it('no share.* key is written and no local sharing switch is drawn (D-80)', async () => {
    at('#me')
    await screen.findByRole('switch', { name: 'Simple mode' })
    expect((await db.kv.toArray()).filter((r) => r.key.startsWith('share.'))).toEqual([])
    expect(screen.queryByRole('switch', { name: 'Share readings' })).toBeNull()
  })
  it('an unknown group lands on the overview, never a blank page', async () => {
    at('#me/constructor')
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
  })
  it('Simple mode is saved', async () => {
    at('#me')
    await userEvent.click(await screen.findByRole('switch', { name: 'Simple mode' }))
    await waitFor(async () => expect((await db.kv.get('mode.simple'))?.value).toBe(true))
  })
})

describe('every group draws its own Back and title (hasOwnHeader)', () => {
  it.each([['alerts', 'Alerts and reminders'], ['display', 'Display'], ['family', 'Family and sharing'], ['phone', 'Phone'], ['signin', 'Sign-in'], ['about', 'About']])('#me/%s', async (g, title) => {
    at(`#me/${g}`)
    expect((await screen.findByRole('heading', { name: title })).textContent).toBe(title)
    expect(screen.getByRole('link', { name: 'Back to Settings' }).getAttribute('href')).toBe('#me')
  })
})

describe('Family and sharing (#me/family)', () => {
  it('"Who can see my records" opens the server list at #sharing; Medical ID links to #medid', async () => {
    at('#me/family')
    expect((await screen.findByRole('link', { name: /Who can see my records/ })).getAttribute('href')).toBe('#sharing')
    expect(screen.getByRole('link', { name: /Medical ID/ }).getAttribute('href')).toBe('#medid')
    expect(document.body.textContent).not.toMatch(/Admins can see everything/)
  })
  it('SOS contacts: two slots only, family pick fills name, phone is stored', async () => {
    at('#me/family')
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
    at('#me/family')
    const row = await screen.findByRole('button', { name: /Who gets your SOS text/ })
    expect(row.textContent).toContain('Nobody picked yet')
    await userEvent.click(row)
    await userEvent.selectOptions(await screen.findByLabelText('Contact 1 family member'), 'Mama')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Who gets your SOS text/ }).textContent).toContain('Mama'))
  })
})

describe('Display (#me/display): choice sheets with radio rows', () => {
  it('Theme: the sheet is a radiogroup, Dark sets data-theme and the kv, System default clears it', async () => {
    at('#me/display')
    await userEvent.click(await screen.findByRole('button', { name: /Theme/ }))
    const group = await screen.findByRole('radiogroup', { name: 'Theme' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['System default', 'Light', 'Dark'])
    expect(within(group).getByRole('radio', { name: 'System default' }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(within(group).getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect((await db.kv.get('look.theme'))?.value).toBe('dark')
    await waitFor(() => expect(screen.queryByRole('radiogroup')).toBeNull()) // picking closes the sheet
    expect(screen.getByRole('button', { name: /Theme/ }).textContent).toContain('Dark')
    await userEvent.click(screen.getByRole('button', { name: /Theme/ }))
    await userEvent.click(await screen.findByRole('radio', { name: 'System default' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
  it('Text size: Bigger text applies to the page and is saved; Cancel changes nothing', async () => {
    at('#me/display')
    await userEvent.click(await screen.findByRole('button', { name: /Text size/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Text size' })
    expect(within(sheet).getByText('Bigger text makes words and buttons larger.')).toBeTruthy()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.documentElement.dataset.text).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: /Text size/ }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Large' }))
    expect(document.documentElement.dataset.text).toBe('large')
    expect((await db.kv.get('look.textsize'))?.value).toBe('large')
  })
  it('Language: English / Filipino, stored in kv lang, and the line says which parts are translated (A-3)', async () => {
    at('#me/display')
    expect(document.body.textContent).toMatch(/Filipino changes medicine reminders, weather advice, Quick dial and SOS status\. The rest of the app stays in English\. Reminders are on the Android app\./)
    await userEvent.click(await screen.findByRole('button', { name: /Language/ }))
    const group = await screen.findByRole('radiogroup', { name: 'Language' })
    expect(within(group).getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(within(group).getByRole('radio', { name: 'Filipino' }))
    await waitFor(async () => expect((await db.kv.get('lang'))?.value).toBe('fil'))
  })
  it('starts on the saved language', async () => {
    await db.kv.put({ key: 'lang', value: 'fil' })
    at('#me/display')
    await waitFor(() => expect(screen.getByRole('button', { name: /Language/ }).textContent).toContain('Filipino'))
  })
})

describe('Alerts and reminders (#me/alerts)', () => {
  it('keeps the alert list row, the quiet-hours switch and its DS-9 line; the 8 PM summary is carers only', async () => {
    at('#me/alerts')
    expect((await screen.findByRole('link', { name: /Alerts list/ })).getAttribute('href')).toBe('#notif')
    expect(screen.getByRole('switch', { name: 'Quiet hours' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('10 PM to 6 AM. SOS and storm alerts still ring; other family updates are silent')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 50)) // DigestToggle reads the carer list first
    expect(screen.queryByRole('switch', { name: '8 PM summary' })).toBeNull() // not a carer: no row
  })
  it('Quiet hours is saved', async () => {
    at('#me/alerts')
    await userEvent.click(await screen.findByRole('switch', { name: 'Quiet hours' }))
    await waitFor(async () => expect((await db.kv.get('quiet.on'))?.value).toBe(false))
  })
  it('call row: hidden on the web, Allow asks once when denied, shows On when granted', async () => {
    const { unmount } = at('#me/alerts')
    await screen.findByRole('switch', { name: 'Quiet hours' })
    expect(screen.queryByText('Hold for help can call for you')).toBeNull()
    unmount()
    call.perm.mockResolvedValue('denied'); call.ask.mockResolvedValue('granted')
    at('#me/alerts')
    expect(await screen.findByText(/Off\. Hold for help opens the dial screen/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(call.ask).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/^On\. Hold for help calls your first contact/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })
  it('call row steps aside when the Alarms rows already warn that Android took the permission back', async () => {
    await db.kv.put({ key: 'phone.check', value: { at: 'x', call_ok: false } })
    call.perm.mockResolvedValue('denied')
    at('#me/alerts')
    await screen.findByRole('switch', { name: 'Quiet hours' })
    await waitFor(() => expect(call.perm).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 80)) // let the permission read and the kv read both settle
    expect(screen.queryByText('Hold for help can call for you')).toBeNull()
  })
})

describe('About, Sign-in, Phone', () => {
  it('About hides the update check from non-admins', async () => {
    at('#me/about')
    await screen.findByRole('heading', { name: 'About' })
    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Family admin tools/ })).toBeNull()
  })
  it('Phone keeps the setup checklist heading and has no Family phones row for someone who looks after nobody', async () => {
    const { container } = at('#me/phone')
    await screen.findByRole('heading', { name: 'Phone' })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: /Family phones/ })).toBeNull()
    expect(rowsOf(container)).toEqual([])
  })
})
