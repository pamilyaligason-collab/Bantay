import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const acting = vi.hoisted(() => ({ on: false }))
const where = vi.hoisted(() => ({ places: null as import('../features/family/placeApi').Place[] | null }))
vi.mock('../features/family/placeApi', async (orig) => ({ ...(await orig<typeof import('../features/family/placeApi')>()), usePlaces: () => where.places }))
vi.mock('../features/auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../features/sync/SyncStatus', () => ({ SyncStatus: () => null })) // HeadActions shows it; it needs the sync module
vi.mock('../features/viewas/viewAs', async (orig) => ({ ...(await orig<object>()), useActing: () => ({ acting: acting.on, personId: acting.on ? 'p9' : null, name: 'Mama' }) }))
vi.mock('../features/family/Memories', () => ({ default: () => <div data-testid="memories-body" /> }))
import type { FamilyPerson } from '../features/family/roster'
import type { Msg } from '../features/family/messagesApi'
import Family, { messagesPreview } from './Family'

afterEach(() => { cleanup(); acting.on = false; where.places = null; location.hash = '' })

const person = (id: string, name: string): FamilyPerson => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false })
const people = [person('p2', 'Ate Joy Cruz'), person('p3', 'Papa Ben')]
const msg = (o: Partial<Msg>): Msg => ({ id: 'x', clientId: null, mine: false, senderPersonId: 'p2', kind: 'text', body: 'hi', name: null, durationS: null, createdAt: '2026-10-27T02:00:00+00:00', url: null, ...o })

describe('messagesPreview', () => {
  it('no messages: Say hello and nothing unread', () => {
    expect(messagesPreview([], people, null)).toEqual({ sub: 'Say hello', unread: 0 })
  })

  it('names the sender of the newest message (first word) and says "You" for your own', () => {
    expect(messagesPreview([msg({ body: 'Dinner at 6' })], people, '2026-10-27T03:00:00Z').sub).toMatch(/^Family chat · Ate: Dinner at 6/)
    expect(messagesPreview([msg({ mine: true, body: 'ok' })], people, null).sub).toMatch(/^Family chat · You: ok/)
    expect(messagesPreview([msg({ senderPersonId: 'zz', body: 'ok' })], people, null).sub).toMatch(/^Family chat · Family: ok/)
  })

  it('words for attachments, not their paths', () => {
    expect(messagesPreview([msg({ kind: 'voice' })], people, null).sub).toMatch(/: Voice note/)
    expect(messagesPreview([msg({ kind: 'photo' })], people, null).sub).toMatch(/: Photo/)
    expect(messagesPreview([msg({ kind: 'kudos', body: null })], people, null).sub).toMatch(/: Sent a heart/)
  })

  it('unread = messages from others strictly after the seen time; yours never count', () => {
    const list = [
      msg({ id: '1', createdAt: '2026-10-27T01:00:00+00:00' }),
      msg({ id: '2', createdAt: '2026-10-27T02:00:00+00:00' }),
      msg({ id: '3', createdAt: '2026-10-27T03:00:00+00:00', mine: true }),
      msg({ id: '4', createdAt: '2026-10-27T04:00:00+00:00' })
    ]
    expect(messagesPreview(list, people, '2026-10-27T01:30:00.000Z').unread).toBe(2) // 2 and 4
    expect(messagesPreview(list, people, '2026-10-27T04:00:00.000Z').unread).toBe(0) // equal instants are seen
    expect(messagesPreview(list, people, null).unread).toBe(3) // never opened: all three from others
  })

  it('compares instants, not strings: "+00:00" and "Z" spellings of the same moment are equal', () => {
    const m = msg({ createdAt: '2026-10-27T02:00:00.500000+00:00' })
    expect(messagesPreview([m], people, '2026-10-27T02:00:00.500Z').unread).toBe(0)
    expect(messagesPreview([m], people, '2026-10-27T02:00:00.499Z').unread).toBe(1)
    // an offset spelling of a later instant is later even though it sorts earlier as text
    expect(messagesPreview([msg({ createdAt: '2026-10-27T10:00:00+08:00' })], people, '2026-10-27T01:00:00Z').unread).toBe(1)
    expect(messagesPreview([msg({ createdAt: '2026-10-27T10:00:00+08:00' })], people, '2026-10-27T02:00:00Z').unread).toBe(0)
  })

  it('an unreadable seen time counts everything from others as unread (the safe side)', () => {
    expect(messagesPreview([msg({})], people, 'garbage').unread).toBe(1)
  })
})

describe('Family root', () => {
  it('has no I am OK button at all (F4: it lives in My day on Today), and no Needs you now, while acting as someone', async () => {
    acting.on = true
    location.hash = '#family'
    render(<Family />)
    await screen.findByTestId('msgs')
    expect(screen.queryByTestId('needs')).toBeNull()
    expect(screen.queryByRole('button', { name: /I'm OK/ })).toBeNull()
  })

  it('Together is Messages and Memories (Plan and Calendar are one Calendar card now, D-168), each a link to its own page', async () => {
    location.hash = '#family'
    render(<Family />)
    const list = await screen.findByTestId('together-list')
    const hrefs = [...list.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#family/messages', '#family/memories'])
    expect(screen.queryByTestId('planrow')).toBeNull()
    expect(screen.getByTestId('calendar')).toBeTruthy() // the one Calendar card is on the root
  })

  it('the Papers card follows Together, with Upload and Scan buttons and a link to all papers', async () => {
    location.hash = '#family'
    render(<Family />)
    const card = await screen.findByTestId('papers-card')
    expect(card.textContent).toContain('Labs, photos and documents')
    expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scan' })).toBeTruthy()
    expect(screen.getByTestId('papersrow').getAttribute('href')).toBe('#family/papers')
    expect(screen.queryByTestId('papers-review')).toBeNull() // nothing waiting: no pill
    expect(card.compareDocumentPosition(screen.getByTestId('together-list')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy() // S25: Together first, then Papers
  })

  it('S28 order: the one Calendar, Together, Papers, Activity, Where, Needs, then Today (the people cards); Activity and Where both render, Activity first; no second list of people', async () => {
    location.hash = '#family'
    where.places = [{ personId: 'p1', lat: 14.6, lon: 121, accuracyM: 20, fixedAt: Date.now() - 60_000, batteryPct: 80, charging: false }] // Where shows only when someone shares
    const { container } = render(<Family />)
    await screen.findByTestId('papers-card')
    await screen.findByTestId('where')
    const ids = ['calendar', 'together', 'papers-section', 'activity', 'where', 'needs', 'people']
    const found = [...container.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid')!).filter((id) => ids.includes(id))
    expect(found).toContain('activity')
    expect(found).toContain('where')
    expect(found.indexOf('activity')).toBeLessThan(found.indexOf('where')) // Activity moved up, above Where everyone is
    expect(found).toEqual(ids.filter((id) => found.includes(id))) // whatever shows is in board order, none repeated
    expect(found.slice(0, 5)).toEqual(['calendar', 'together', 'papers-section', 'activity', 'where'])
    expect(container.querySelector('[data-testid="facesrow"]')).toBeNull()
  })

  it('Scan opens the scan flow', async () => {
    location.hash = '#family'
    render(<Family />)
    fireEvent.click(await screen.findByRole('button', { name: 'Scan' }))
    expect(location.hash).toBe('#scan')
    expect(history.state?.bantayScan).toBe(1)
  })

  it('#family/calendar shows only the Calendar under a Back to Family header; #family/plan opens the same Calendar (D-168)', () => {
    location.hash = '#family/calendar'
    const first = render(<Family />)
    expect(screen.getByRole('link', { name: 'Back to Family' }).getAttribute('href')).toBe('#family')
    expect(screen.queryByText('Add to the plan')).toBeNull()
    expect(screen.getByTestId('calendar')).toBeTruthy()
    first.unmount()
    location.hash = '#family/plan'
    render(<Family />)
    expect(screen.getByTestId('calendar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Month' })).toBeTruthy()
  })

  it('#family/memories is a pushed page with a Back to Family link; #family/feed is off by default and returns to Family', async () => {
    location.hash = '#family/memories'
    const first = render(<Family />)
    expect(await screen.findByTestId('memories-body')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Family' })).toBeTruthy()
    first.unmount()
    location.hash = '#family/feed'
    render(<Family />)
    await vi.waitFor(() => expect(location.hash).toBe('#family'))
  })
})
