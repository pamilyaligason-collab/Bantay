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

describe('Family segments', () => {
  it('parses the deep links', () => {
    expect(parseFamily('#family')).toEqual({ seg: 'home', member: null })
    expect(parseFamily('#family/plan')).toEqual({ seg: 'plan', member: null })
    expect(parseFamily('#family/people')).toEqual({ seg: 'home', member: null }) // old link still opens Home
    expect(parseFamily('#family/messages')).toEqual({ seg: 'messages', member: null })
    expect(parseFamily('#messages')).toEqual({ seg: 'home', member: null }) // only #family/messages names Messages
    expect(parseFamily('#family/people/p2')).toEqual({ seg: 'home', member: 'p2' })
    expect(parseFamily('#family/records')).toEqual({ seg: 'home', member: null }) // Records moved to Health > Papers
    expect(parseFamily('#plan')).toEqual({ seg: 'plan', member: null })
  })

  it('shows Home | Messages | Plan only (no Records); each writes its hash', async () => {
    render(<Family />)
    const seg = screen.getByRole('group', { name: 'Family view' })
    expect(within(seg).getAllByRole('button').map((b) => b.textContent)).toEqual(['Home', 'Messages', 'Plan'])
    fireEvent.click(within(seg).getByRole('button', { name: 'Plan' }))
    expect(location.hash).toBe('#family/plan')
    fireEvent.click(within(seg).getByRole('button', { name: 'Messages' }))
    expect(location.hash).toBe('#family/messages')
    fireEvent.click(within(seg).getByRole('button', { name: 'Home' }))
    expect(location.hash).toBe('#family')
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

describe('People', () => {
  const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }

  it('shows the family as status bubbles with the latest I\'m OK, and hides the check-in card once I have checked in', async () => {
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' })
    location.hash = '#family'
    render(<Family />)
    const roll = await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect(within(roll).getByRole('button', { name: /^Lloyd Roc \(you\), OK 7:40/ })).toBeTruthy())
    expect(within(roll).getByRole('button', { name: /^Kuya Ben, No check-in today/ })).toBeTruthy()
    expect(within(roll).getByText(/^OK 7:40/)).toBeTruthy() // S9: the words are the last check-in
    expect(within(roll).getByText('No check-in yet')).toBeTruthy()
    expect(within(roll).getAllByTestId('bubble-emoji').map((e) => e.textContent)).toEqual(['✅']) // no sleep icon for a quiet person
    expect(screen.queryByText("Today's check-in")).toBeNull() // already logged: no second ask
    expect(screen.queryByText('Phone health data')).toBeNull() // the switches moved to Me
  })

  it('I\'m OK writes a check-in activity row, then the card stays as done with focus on it', async () => {
    location.hash = '#family'
    render(<Family />)
    await screen.findByRole('list', { name: 'Family roll call' })
    expect(await screen.findByText('0 of 2 OK today')).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('button', { name: "I'm OK" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: "I'm OK" }))
    expect(await screen.findByText(/^You're OK · /)).toBeTruthy() // the same card turns into the done state after the write
    expect(screen.queryByText("Today's check-in")).toBeNull()
    expect(screen.getByText(/Your family can see it/)).toBeTruthy()
    expect(within(document.querySelector('.fm-checkin') as HTMLElement).getByRole('status').textContent).toMatch(/^You're OK · .*Your family can see it/) // announced politely to a screen reader
    expect(document.activeElement?.classList.contains('fm-checkin')).toBe(true) // focus moves to the card, not lost with the button
    expect((await ldb.activity.toArray())[0]).toMatchObject({ personId: 'p1', kind: 'check-in', minutes: null, steps: null })
  })

  it("I'm OK that fails to save shows the failure text and never the \"You're OK\" morph", async () => {
    location.hash = '#family'
    render(<Family />)
    await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect((screen.getByRole('button', { name: "I'm OK" }) as HTMLButtonElement).disabled).toBe(false))
    const add = vi.spyOn(ldb.activity, 'add').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByRole('button', { name: "I'm OK" }))
    expect(await screen.findByText('Could not save on this phone. Try again.')).toBeTruthy()
    expect(screen.queryByText(/^You're OK · /)).toBeNull()
    expect((screen.getByRole('button', { name: "I'm OK" }) as HTMLButtonElement).disabled).toBe(false) // still there to try again
    add.mockRestore()
  })

  it('the roster is a busy skeleton (aria-busy) until the first read, then the list', async () => {
    location.hash = '#family'
    const { container } = render(<Family />)
    expect(container.querySelector('section[aria-busy="true"]')).not.toBeNull() // first paint: nothing says "No check-in today" yet
    expect(screen.queryByRole('list', { name: 'Family roll call' })).toBeNull()
    await screen.findByRole('list', { name: 'Family roll call' })
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it("the I'm OK morph only animates inside the no-preference media block, so reduced motion is instant", () => {
    const css = readFileSync(resolve(__dirname, 'family.css'), 'utf8')
    const animated = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*?\n\}/g)!.join('')
    expect(animated).toMatch(/\.fm-okdone \{ animation: fm-ok-in/) // the animation lives in the guarded block
    const outside = css.replace(animated, '')
    expect(outside.split('\n').filter((l) => /fm-ok/.test(l) && /(transition|animation)\s*:/.test(l))).toEqual([]) // and nowhere else
  })

  // The bubble opens the person's page now (S9), so the Messages sheet is rendered directly here; the nudge wiring itself is roster.nudgeFor.
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
    expect(within(dlg).getByRole('link', { name: 'Use Messenger for video' }).getAttribute('href')).toBe('https://www.messenger.com/')
    expect(await within(dlg).findByText('Messages need you to be signed in')).toBeTruthy() // no Supabase in tests: plain words, no crash
  })

  it('tapping a bubble opens that person\'s page', async () => {
    location.hash = '#family'
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: /Kuya Ben, No check-in today/ }))
    expect(location.hash).toBe('#family/people/p2')
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
