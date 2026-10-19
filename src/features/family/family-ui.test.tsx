import 'fake-indexeddb/auto'
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
import { fdb } from './store'

beforeEach(async () => {
  location.hash = ''
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.profiles.clear(), fdb.tasks.clear(), fdb.events.clear(), fdb.notes.clear(), ldb.activity.clear(), hdb.people.clear()])
  await hdb.people.bulkPut([{ id: 'p1', name: 'Lloyd Roc' }, { id: 'p2', name: 'Kuya Ben' }])
})
afterEach(cleanup)

describe('Family segments', () => {
  it('parses the deep links', () => {
    expect(parseFamily('#family')).toEqual({ seg: 'people', member: null })
    expect(parseFamily('#family/plan')).toEqual({ seg: 'plan', member: null })
    expect(parseFamily('#family/people')).toEqual({ seg: 'people', member: null })
    expect(parseFamily('#family/people/p2')).toEqual({ seg: 'people', member: 'p2' })
    expect(parseFamily('#records')).toEqual({ seg: 'records', member: null })
    expect(parseFamily('#plan')).toEqual({ seg: 'plan', member: null })
  })

  it('shows Records | Plan | People in that order and Plan writes #family/plan', async () => {
    render(<Family />)
    const seg = screen.getByRole('group', { name: 'Family view' })
    expect(within(seg).getAllByRole('button').map((b) => b.textContent)).toEqual(['Records', 'Plan', 'People'])
    fireEvent.click(within(seg).getByRole('button', { name: 'Plan' }))
    expect(location.hash).toBe('#family/plan')
  })
})

describe('Plan', () => {
  it('adds a task offline, ticks it, assigns a person, and writes an outbox row each time', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
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
    const hint = await screen.findByRole('button', { name: /^Add a reminder for / })
    expect(hint.textContent).not.toMatch(/Lola/) // names a real family member, never a made-up one
    await waitFor(() => expect(screen.getByRole('button', { name: /^Add a reminder for / }).textContent).toMatch(/^Add a reminder for (Kuya|Lloyd)'s check-up.$/))
    expect(screen.getAllByRole('button', { name: /^Add/ }).length).toBe(2) // the floating Add and the empty-state link
    fireEvent.click(screen.getByRole('button', { name: /^Later/ }))
    expect(screen.getByText('Nothing planned for later.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('refuses an empty title with a plain message and saves nothing', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Type a name first.')
    expect(await db.outbox.count()).toBe(0)
  })

  it('adds an event on the chosen day and the Mine layer hides someone else\'s', async () => {
    location.hash = '#family/plan'
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Event' }))
    fireEvent.change(screen.getByLabelText('What is happening?'), { target: { value: 'Family dinner' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Family dinner')).toBeTruthy()
    expect(await fdb.events.count()).toBe(1)
    await waitFor(() => expect(screen.queryByLabelText('What is happening?')).toBeNull()) // sheet closed before the next Add
    // an event for Ben on the same day
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
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
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }))
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

  it('lists the family with the latest I\'m OK, else "No check-in today", and counts them', async () => {
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' })
    location.hash = '#family'
    render(<Family />)
    const roll = await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect(within(roll).getByText(/^OK 7:40/)).toBeTruthy())
    expect(within(roll).getByText('No check-in today')).toBeTruthy()
    expect(screen.getByText('1 of 2 OK today')).toBeTruthy()
    expect(within(roll).getByText('Lloyd Roc (you)')).toBeTruthy()
    expect(screen.queryByText('Phone health data')).toBeNull() // the switches moved to Me
  })

  it('I\'m OK writes a check-in activity row and shows it', async () => {
    location.hash = '#family'
    render(<Family />)
    await screen.findByRole('list', { name: 'Family roll call' })
    await waitFor(() => expect((screen.getByRole('button', { name: "I'm OK" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: "I'm OK" }))
    await waitFor(() => expect(screen.getByText('1 of 2 OK today')).toBeTruthy())
    expect((await ldb.activity.toArray())[0]).toMatchObject({ personId: 'p1', kind: 'check-in', minutes: null, steps: null })
  })

  it('tapping a person opens their page', async () => {
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
