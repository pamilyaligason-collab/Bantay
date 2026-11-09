import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'

configure({ asyncUtilTimeout: 6000 })
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../sync/SyncStatus', () => ({ SyncStatus: () => null })) // HeadActions (Family title row) shows it
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

import Family, { parseFamily } from '../../screens/Family'
import MemberPage from './MemberPage'
import { fdb } from './store'

beforeEach(async () => {
  location.hash = ''
  await Promise.all([db.outbox.clear(), db.kv.clear(), db.profiles.clear(), fdb.tasks.clear(), fdb.events.clear(), fdb.notes.clear(), ldb.activity.clear(), hdb.people.clear()])
  await hdb.people.bulkPut([{ id: 'p1', name: 'Rey Villar' }, { id: 'p2', name: 'Kuya Ben' }])
})
afterEach(cleanup)

describe('Family routes', () => {
  it('parses the deep links', () => {
    expect(parseFamily('#family')).toEqual({ seg: 'home', member: null })
    expect(parseFamily('#family/plan')).toEqual({ seg: 'calendar', member: null }) // D-168: the old Plan link opens the Calendar
    expect(parseFamily('#family/people')).toEqual({ seg: 'home', member: null }) // old link still opens Home
    expect(parseFamily('#family/messages')).toEqual({ seg: 'messages', member: null })
    expect(parseFamily('#family/papers')).toEqual({ seg: 'papers', member: null })
    expect(parseFamily('#messages')).toEqual({ seg: 'home', member: null }) // only #family/messages names Messages
    expect(parseFamily('#family/people/p2')).toEqual({ seg: 'home', member: 'p2' })
    expect(parseFamily('#plan')).toEqual({ seg: 'calendar', member: null })
    expect(parseFamily('#family/calendar')).toEqual({ seg: 'calendar', member: null })
    expect(parseFamily('#calendar')).toEqual({ seg: 'home', member: null }) // only #family/calendar names the Calendar
  })

  it('the root has no Home | Messages | Plan segments: Messages and Memories are tiles, Plan and Calendar are one card, Back returns', async () => {
    location.hash = '#family'
    const { unmount } = render(<Family />)
    expect(screen.queryByRole('group', { name: 'Family view' })).toBeNull()
    expect((await screen.findByTestId('msgs')).getAttribute('href')).toBe('#family/messages')
    expect(screen.queryByTestId('planrow')).toBeNull()
    expect(screen.queryByTestId('calrow')).toBeNull()
    expect(screen.getByTestId('calendar')).toBeTruthy()
    unmount()
    location.hash = '#family/calendar'
    render(<Family />)
    expect(screen.getByRole('link', { name: 'Back to Family' }).getAttribute('href')).toBe('#family')
  })
})

describe('Faces row', () => {
  const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }

  it('has no Family Today list any more (D-168): my status is on my People card, nobody else is invented', async () => {
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', minutes: null, steps: null, startedAt: at(7, 40), source: 'manual' })
    location.hash = '#family'
    const { container } = render(<Family />)
    const rows = await screen.findAllByTestId('people-row')
    expect(container.querySelector('[data-testid="facesrow"]')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Family roll call' })).toBeNull()
    expect(screen.queryByTestId('person-card')).toBeNull()
    expect(rows.find((r) => /Rey|You/.test(r.textContent ?? '') && /OK/.test(r.textContent ?? ''))).toBeTruthy() // my card carries my check-in
    expect(screen.queryByText(/checked in$/)).toBeNull()
    expect(screen.queryByText('Phone health data')).toBeNull()
  })

  it("has no I'm OK button: that action lives in My day on Today (F4)", async () => {
    location.hash = '#family'
    render(<Family />)
    await screen.findByTestId('calendar')
    expect(screen.queryByRole('button', { name: /I'm OK/ })).toBeNull()
  })

  it("the I'm OK morph only animates inside the no-preference media block, so reduced motion is instant", () => {
    const css = readFileSync(resolve(__dirname, 'family.css'), 'utf8')
    const animated = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*?\n\}/g)!.join('')
    expect(animated).toMatch(/\.fm-okdone \{ animation: fm-ok-in/)
    const outside = css.replace(animated, '')
    expect(outside.split('\n').filter((l) => /fm-ok/.test(l) && /(transition|animation)\s*:/.test(l))).toEqual([])
  })

  it("Kuya's People card (no phone, no saved name) has no Message button and no Messenger or WhatsApp: it offers Add Messenger name on his page", async () => {
    location.hash = '#family'
    render(<Family />)
    const card = (await screen.findAllByTestId('people-row')).find((r) => /Kuya/.test(r.textContent ?? ''))!
    expect(within(card).queryByRole('button', { name: 'Message' })).toBeNull()
    expect(within(card).queryByRole('link', { name: /Messenger$|WhatsApp/ })).toBeNull()
    expect(within(card).getByRole('link', { name: 'Add Messenger name' }).getAttribute('href')).toBe('#family/people/p2')
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
