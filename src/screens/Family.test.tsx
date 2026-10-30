import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const acting = vi.hoisted(() => ({ on: false }))
vi.mock('../features/auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../features/viewas/viewAs', async (orig) => ({ ...(await orig<object>()), useActing: () => ({ acting: acting.on, personId: acting.on ? 'p9' : null, name: 'Mama' }) }))
vi.mock('../features/family/NeedYouNow', () => ({ default: () => <div data-testid="needyounow" /> }))
vi.mock('../features/family/Memories', () => ({ default: () => <div data-testid="memories-body" /> }))
import type { FamilyPerson } from '../features/family/roster'
import type { Msg } from '../features/family/messagesApi'
import Family, { messagesPreview } from './Family'

afterEach(() => { cleanup(); acting.on = false; location.hash = '' })

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
  it('draws Needs you now when not acting, and not at all while acting as someone', async () => {
    location.hash = '#family'
    const first = render(<Family />)
    expect(await screen.findByTestId('needyounow')).toBeTruthy()
    first.unmount()
    acting.on = true
    render(<Family />)
    await screen.findByTestId('msgs')
    expect(screen.queryByTestId('needyounow')).toBeNull()
  })

  it('Memories is one button with one expanded state, drawn with icons (no text glyph), and opens the photos in place', async () => {
    location.hash = '#family'
    render(<Family />)
    const row = await screen.findByTestId('memoriesrow')
    const btn = row.querySelector('button.rw-main') as HTMLButtonElement
    expect(row.querySelectorAll('button')).toHaveLength(1)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.textContent).not.toMatch(/[–+]/)
    expect(screen.queryByTestId('memories-body')).toBeNull()
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('memories-body')).toBeTruthy()
    expect(document.getElementById(btn.getAttribute('aria-controls')!)).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.queryByTestId('memories-body')).toBeNull()
  })
})
