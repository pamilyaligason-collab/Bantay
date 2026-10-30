import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { dayKey } from './events'
import { ldb } from '../log/store'
import { hdb } from '../records/store'

configure({ asyncUtilTimeout: 6000 })
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

import Family, { parseFamily } from '../../screens/Family'
import MemberPage from './MemberPage'
import Messages from './Messages'
import { fdb } from './store'

beforeEach(async () => {
  location.hash = ''
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.profiles.clear(), fdb.tasks.clear(), fdb.events.clear(), fdb.notes.clear(), ldb.activity.clear(), hdb.people.clear()])
  await hdb.people.bulkPut([{ id: 'p1', name: 'Lloyd Roc' }, { id: 'p2', name: 'Kuya Ben' }])
})
afterEach(cleanup)

describe('Family routes', () => {
  it('parses the deep links', () => {
    expect(parseFamily('#family')).toEqual({ seg: 'home', member: null })
    expect(parseFamily('#family/plan')).toEqual({ seg: 'plan', member: null })
    expect(parseFamily('#family/people')).toEqual({ seg: 'home', member: null }) // old link still opens Home
    expect(parseFamily('#family/messages')).toEqual({ seg: 'messages', member: null })
    expect(parseFamily('#family/papers')).toEqual({ seg: 'papers', member: null })
    expect(parseFamily('#messages')).toEqual({ seg: 'home', member: null }) // only #family/messages names Messages
    expect(parseFamily('#family/people/p2')).toEqual({ seg: 'home', member: 'p2' })
    expect(parseFamily('#plan')).toEqual({ seg: 'plan', member: null })
  })

  it('the root has no Home | Messages | Plan segments: Messages and Plan are rows, Back returns', async () => {
    location.hash = '#family'
    const { unmount } = render(<Family />)
    expect(screen.queryByRole('group', { name: 'Family view' })).toBeNull()
    expect((await screen.findByTestId('msgs')).querySelector('a')!.getAttribute('href')).toBe('#family/messages')
    expect(screen.getByTestId('planrow').querySelector('a')!.getAttribute('href')).toBe('#family/plan')
    unmount()
    location.hash = '#family/plan'
    render(<Family />)
    expect(screen.getByRole('link', { name: 'Back to Family' }).getAttribute('href')).toBe('#family')
  })
})

describe('Plan', () => {
  it('adds a task offline, ticks it, assigns a person, and writes an outbox row each time', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add' }))[0]!)
    fireEvent.change(screen.getByLabelText('What needs doing?'), { target: { value: 'Buy rice' } })
    expect(within(screen.getByRole('group', { name: 'When?' })).getByRole('button', { name: 'Today' }).getAttribute('aria-pressed')).toBe('true') // the quick pick starts on Today
    await waitFor(() => expect(within(screen.getByLabelText('Who does it?')).getAllByRole('option').length).toBe(3)) // Everyone + two people
    fireEvent.change(screen.getByLabelText('Who does it?'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const box = await screen.findByRole('checkbox', { name: 'Buy rice' })
    expect(box.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Kuya')).toBeTruthy()
    expect(screen.getByText('0 of 1 completed')).toBeTruthy()
    expect((await fdb.tasks.toArray())[0]).toMatchObject({ title: 'Buy rice', due: dayKey(new Date()), assigneePersonId: 'p2' })
    fireEvent.click(box)
    await waitFor(() => expect(screen.getByText('1 of 1 completed')).toBeTruthy()) // ticked: it stays on its day, counted ...
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect((await screen.findByRole('checkbox', { name: 'Buy rice' })).getAttribute('aria-checked')).toBe('true') // ... and waits in Done
    await waitFor(async () => expect(await db.outbox.count()).toBe(2))
  })

  it('repeat daily adds one reminder per day, each with an outbox row', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add' }))[0]!)
    fireEvent.change(screen.getByLabelText('What needs doing?'), { target: { value: 'Take vitamins' } })
    fireEvent.click(screen.getByRole('button', { name: 'Every day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await fdb.tasks.count()).toBe(14))
    expect(await db.outbox.count()).toBe(14)
    expect(new Set((await fdb.tasks.toArray()).map((t) => t.clientId)).size).toBe(14)
  })

  it('teaches on an empty tab and the Add button is always there', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    const hint = await screen.findByText(/^Add a reminder for /)
    expect(hint.textContent).not.toMatch(/Lola/) // names a real family member, never a made-up one
    await waitFor(() => expect(screen.getByText(/^Add a reminder for /).textContent).toMatch(/^Add a reminder for (Kuya|Lloyd)'s check-up.$/))
    expect(screen.getAllByRole('button', { name: 'Add' }).length).toBe(1) // the floating Add; the empty-state action has its own name
    expect(screen.getByRole('button', { name: 'Add to the plan' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Later/ }))
    expect(screen.getByText('Nothing planned for later.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Add' })[0]!).toBeTruthy()
  })

  it('refuses an empty title with a plain message and saves nothing', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add' }))[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Type a name first.')
    expect(await db.outbox.count()).toBe(0)
  })

  it('adds an event on the chosen day and the Mine layer hides someone else\'s', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add' }))[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Event' }))
    fireEvent.change(screen.getByLabelText('What is happening?'), { target: { value: 'Family dinner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Family dinner')).toBeTruthy()
    expect(await fdb.events.count()).toBe(1)
    await waitFor(() => expect(screen.queryByLabelText('What is happening?')).toBeNull()) // sheet closed before the next Add
    // an event for Ben on the same day
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Event' }))
    fireEvent.change(screen.getByLabelText('What is happening?'), { target: { value: 'Ben dentist' } })
    await waitFor(() => expect(within(screen.getByLabelText('Who is it for?')).getAllByRole('option').length).toBe(3))
    fireEvent.change(screen.getByLabelText('Who is it for?'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await fdb.events.count()).toBe(2))
    expect(await screen.findByText('Ben dentist')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mine only' }))
    await waitFor(() => expect(screen.queryByText('Ben dentist')).toBeNull())
    expect(screen.getByText('Family dinner')).toBeTruthy()
  })

  it('adds, pins and edits a note', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add' }))[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByLabelText('Note for the family'), { target: { value: 'Gate code 1234' } })
    fireEvent.click(screen.getByLabelText('Pin it to the top'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Pinned note')).toBeTruthy()
    // The list re-renders from the live query before the sheet's onClose runs; wait for the dialog to go or its textarea matches too.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Gate code 1234')).toBeTruthy()
    expect((await fdb.notes.toArray())[0]).toMatchObject({ body: 'Gate code 1234', pinned: true })
  })
})

describe('Faces row', () => {
  const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }

  it('draws a status ring and a corner glyph per face, with a legend, and the latest I\'m OK', async () => {
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' })
    location.hash = '#family'
    render(<Family />)
    const roll = await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect(within(roll).getByRole('button', { name: /^Lloyd Roc \(you\), OK 7:40/ })).toBeTruthy())
    expect(within(roll).getByRole('button', { name: /^Kuya Ben, No check-in today/ })).toBeTruthy()
    expect(within(roll).getAllByTestId('face-ring').map((e) => e.getAttribute('data-k')).sort()).toEqual(['none', 'ok'])
    expect(within(roll).getAllByTestId('bubble-badge').length).toBe(2) // colour plus shape on every face
    expect(within(roll).getByText('No check-in yet')).toBeTruthy()
    expect(screen.getByLabelText('Legend').textContent).toBe('OK todayNeeds a lookNo news')
    expect(screen.queryByText('Phone health data')).toBeNull()
  })

  it('I\'m OK writes a check-in activity row and turns into "You\'re OK" with focus kept', async () => {
    location.hash = '#family'
    render(<Family />)
    await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect((screen.getByRole('button', { name: "I'm OK" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: "I'm OK" }))
    expect(await screen.findByText(/^You're OK · /)).toBeTruthy()
    expect((await screen.findByText('The family can see you are OK.')).getAttribute('role')).toBe('status')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(document.activeElement?.classList.contains('fm2-fh')).toBe(true)
    expect((await ldb.activity.toArray())[0]).toMatchObject({ personId: 'p1', kind: 'check-in', minutes: null, steps: null })
  })

  it("I'm OK that fails to save shows the failure text and never the done state", async () => {
    location.hash = '#family'
    render(<Family />)
    await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect((screen.getByRole('button', { name: "I'm OK" }) as HTMLButtonElement).disabled).toBe(false))
    const add = vi.spyOn(ldb.activity, 'add').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByRole('button', { name: "I'm OK" }))
    expect(await screen.findByText('Could not save on this phone. Try again.')).toBeTruthy()
    expect(screen.queryByText(/^You're OK · /)).toBeNull()
    add.mockRestore()
  })

  it('the roster is busy until the first read, then the faces', async () => {
    location.hash = '#family'
    const { container } = render(<Family />)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await screen.findByRole('list', { name: 'Family roll call' })
    expect(container.querySelector('.fm2-faces [aria-busy="true"]')).toBeNull()
  })

  it("the I'm OK morph only animates inside the no-preference media block, so reduced motion is instant", () => {
    const css = readFileSync(resolve(__dirname, 'family.css'), 'utf8')
    const animated = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*?\n\}/g)!.join('')
    expect(animated).toMatch(/\.fm-okdone \{ animation: fm-ok-in/)
    const outside = css.replace(animated, '')
    expect(outside.split('\n').filter((l) => /fm-ok/.test(l) && /(transition|animation)\s*:/.test(l))).toEqual([])
  })

  const ben = { id: 'p2', name: 'Kuya Ben', photoPath: null, thumb: null, phone: null as string | null, birthdate: null, isMe: false }
  const sheet = (phone: string | null, nudge: { text: string; href: string } | null) => render(<Messages who={{ ...ben, phone }} people={[{ ...ben, phone }]} nudge={nudge} onClose={() => undefined} onOpenPage={() => undefined} />)

  it('no phone: the messages sheet shows no hello nudge and no Call', async () => {
    sheet(null, null)
    const dlg = await screen.findByRole('dialog', { name: 'Message Kuya' })
    expect(within(dlg).queryByText('Not checked in today: send a hello')).toBeNull()
    expect(within(dlg).queryByRole('link', { name: /Call Kuya/ })).toBeNull()
  })

  it('with a phone saved, the messages sheet has Call and the hello link', async () => {
    sheet('+63 917 123 4567', { text: 'Not checked in today: send a hello', href: 'sms:+639171234567' })
    const dlg = await screen.findByRole('dialog', { name: 'Message Kuya' })
    expect(within(dlg).getByRole('link', { name: 'Call Kuya' }).getAttribute('href')).toBe('tel:+639171234567')
    expect(within(dlg).getByText('Not checked in today: send a hello').getAttribute('href')).toBe('sms:+639171234567')
    expect(await within(dlg).findByText('Messages need you to be signed in')).toBeTruthy()
  })

  it('tapping a face opens a sheet whose Send a message link opens the one chat with @name ready', async () => {
    location.hash = '#family'
    const { unmount } = render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: /Kuya Ben, No check-in today/ }))
    const dlg = await screen.findByRole('dialog', { name: 'Kuya Ben' })
    const send = within(dlg).getByRole('link', { name: 'Send a message' })
    expect(send.getAttribute('href')).toBe('#family/messages')
    fireEvent.click(send)
    unmount()
    location.hash = '#family/messages'
    render(<Family />)
    expect((await screen.findByLabelText('Message') as HTMLTextAreaElement).value).toBe('@Kuya Ben ')
  })
})

describe('Member page', () => {
  it('shows age, call and text buttons, last check-in, Medical ID link and the privacy note', async () => {
    const year = new Date().getFullYear() - 60
    await db.profiles.put({ id: 'p2', photoPath: null, phone: '+63 917 123 4567', birthdate: `${year}-01-01`, bloodType: null, allergies: [], conditions: [], medicines: [], updatedAt: null })
    await ldb.activity.add({ personId: 'p2', kind: 'check-in', minutes: null, steps: null, startedAt: new Date().toISOString(), source: 'manual' })
    render(<MemberPage id="p2" />)
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Kuya Ben')
    await waitFor(() => expect(screen.getByText(/60 years old/)).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Call Kuya' }).getAttribute('href')).toBe('tel:+639171234567')
    expect(screen.getByRole('link', { name: 'Text Kuya' }).getAttribute('href')).toBe('sms:+639171234567')
    expect(screen.getByRole('link', { name: /Medical ID/ }).getAttribute('href')).toBe('#medid/p2')
    expect(screen.getByText(/Health readings and records are private/)).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText(/^OK /).length).toBeGreaterThan(0))
  })

  it('without a phone or age it says so, never a made-up value', async () => {
    render(<MemberPage id="p2" />)
    expect(await screen.findByText('No age or phone saved yet')).toBeTruthy()
    expect(screen.getByText(/No phone number saved for Kuya/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull()
    expect(screen.getByText('Never checked in on this phone')).toBeTruthy()
  })

  it('an unknown person gets a plain message and a way back', async () => {
    render(<MemberPage id="nobody" />)
    expect(await screen.findByText(/could not find this person/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Back to People/ }))
    expect(location.hash).toBe('#family')
  })
})
