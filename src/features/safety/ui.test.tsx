import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import places from '../../data/safety/places.json'
import { type Alert, NOT_A_SIREN } from './alerts'
import AlertCard from './AlertCard'
import EntryList from './EntryList'
import type { Entry } from './entries'
import { loadNews, safeUrl } from './news'
import NewsTop5 from './NewsTop5'
import { PracticeCard, CARDS } from './Practice'
import { ALERTS_KEY } from './SafetyBrief'
import SafetyBrief from './SafetyBrief'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

const quake: Alert = {
  id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now',
  doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: 'https://www.phivolcs.dost.gov.ph/', issuedAt: '2026-10-17T01:00:00Z',
  lat: 10.1, lon: 124.0, bulletin: 'Magnitude 5.1. No tsunami threat.', previousBulletin: 'Magnitude 4.9. No tsunami threat.'
}

describe('AlertCard', () => {
  it('shows brief, the not-a-siren line for quakes, and the bulletin diff', () => {
    render(<AlertCard alert={quake} />)
    expect(screen.getByText('Drop, cover and hold on.')).toBeTruthy()
    expect(screen.getByText(NOT_A_SIREN)).toBeTruthy()
    expect(screen.getByText('Magnitude 5.1.', { exact: false, selector: 'li' })).toBeTruthy()
  })
  it('no siren line for a heat alert', () => {
    render(<AlertCard alert={{ ...quake, kind: 'heat', previousBulletin: null }} />)
    expect(screen.queryByText(NOT_A_SIREN)).toBeNull()
    expect(screen.getByText(/first version/)).toBeTruthy()
  })
})

describe('AlertCard stale and new kinds (D-25)', () => {
  it('a fresh alert shows no stale note', () => {
    render(<AlertCard alert={quake} />)
    expect(screen.queryByText(/source unreachable/)).toBeNull()
  })
  it('a stale alert says when it was last checked', () => {
    render(<AlertCard alert={{ ...quake, stale: true, checkedAt: '2026-10-17T12:00:00Z' }} />)
    const note = screen.getByRole('status').textContent!
    expect(note).toMatch(/^Last checked .*2026.*; source unreachable\.$/)
    expect(note).toContain('8:00') // 12:00 UTC is 8:00 pm in Manila
  })
  it('a stale alert with no check time says so plainly, never a made-up time', () => {
    render(<AlertCard alert={{ ...quake, stale: true, checkedAt: null }} />)
    expect(screen.getByRole('status').textContent).toBe('Source unreachable. This is the last information we have.')
  })
  it.each(['volcano', 'air'] as const)('%s renders with no siren line and no weather map', (kind) => {
    render(<AlertCard alert={{ ...quake, kind, previousBulletin: null }} />)
    expect(screen.getByText('Drop, cover and hold on.')).toBeTruthy()
    expect(screen.queryByText(NOT_A_SIREN)).toBeNull()
    expect(screen.queryByText('Weather map')).toBeNull()
  })
})

describe('SafetyBrief', () => {
  it('empty state, then the top ranked alert from Dexie, limited', async () => {
    render(<SafetyBrief limit={1} />)
    expect(screen.getByRole('status').textContent).toContain('No active warnings')
    await db.kv.put({ key: ALERTS_KEY, value: [{ ...quake, id: 'g', kind: 'gdacs', title: 'Storm context' }, quake] })
    await waitFor(() => expect(screen.getByLabelText('Earthquake')).toBeTruthy(), { timeout: 5000 }) // liveQuery is slow under parallel CPU load
    expect(screen.queryByLabelText('Storm context')).toBeNull()
  })
})

describe('EntryList', () => {
  it('shows the unconfirmed prompt for a null place, and a Go link after the family adds a pin', async () => {
    render(<EntryList seed={places as Entry[]} geo zone="dampas" />)
    const prompts = screen.getAllByRole('button', { name: 'Not confirmed yet, tap to add' })
    expect(prompts.length).toBe(places.length)
    expect(screen.queryByRole('link', { name: /^Go to/ })).toBeNull()
    fireEvent.click(prompts[0])
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '9.65' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '123.88' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const go = await screen.findByRole('link', { name: /^Go to/ }, { timeout: 5000 }) // slow under full-suite load
    expect(go.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=9.65,123.88&travelmode=walking')
  })
  it('rejects bad coordinates', async () => {
    render(<EntryList seed={places as Entry[]} geo zone="dampas" />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Not confirmed yet, tap to add' })[0])
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('-90 to 90')
  })
})

describe('PracticeCard', () => {
  it('earthquake and tsunami cards carry the not-a-siren line; typhoon does not', () => {
    for (const id of ['earthquake', 'tsunami', 'typhoon']) {
      const { unmount } = render(<PracticeCard card={CARDS.find((c) => c.id === id)!} />)
      expect(!!screen.queryByText(NOT_A_SIREN), id).toBe(id !== 'typhoon')
      unmount()
    }
  })
  it('has the seven hazards, typhoon and earthquake first, and no emdash', () => {
    expect(CARDS.map((c) => c.id)).toEqual(['typhoon', 'earthquake', 'flood', 'tsunami', 'fire', 'heat', 'landslide'])
    expect(JSON.stringify(CARDS) + NOT_A_SIREN).not.toContain('—')
  })
})

describe('news', () => {
  const rows = [{ id: '1', title: 'T', url: 'https://a.test/x', source: 'PIA', kind: 'article', published_at: '2026-10-17T00:00:00Z' }, { id: '2', title: 'bad', url: 'javascript:alert(1)', source: 'x', kind: 'article', published_at: '2026-10-17T00:00:00Z' }]
  it('null without env; empty state shows', async () => {
    expect(await loadNews({})).toBeNull()
    render(<NewsTop5 />)
    expect((await screen.findByRole('status')).textContent).toContain('not connected')
  })
  it('fetches the rest endpoint, drops non-http urls, and caches for offline', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(rows), { status: 200 }))
    const out = await loadNews({ VITE_SUPABASE_URL: 'https://x.supabase.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }, f as unknown as typeof fetch)
    expect(out?.map((n) => n.id)).toEqual(['1'])
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('/rest/v1/news_items?')
    const offline = vi.fn(async () => { throw new Error('offline') })
    const again = await loadNews({ VITE_SUPABASE_URL: 'https://x.supabase.test' }, offline as unknown as typeof fetch)
    expect(again?.map((n) => n.id)).toEqual(['1'])
  })
  it('drops bid and procurement notices and still returns 5', async () => {
    const mk = (id: string, title: string, source = 'PIA') => ({ id, title, url: 'https://a.test/' + id, source, kind: 'article', published_at: '2026-10-17T00:00:00Z' })
    const list = [mk('b1', 'Invitation to Bid for road works'), mk('b2', 'Ref (123456789-AB) tender'), mk('b3', 'Notice', 'Procurement Service'), ...['1', '2', '3', '4', '5', '6'].map((i) => mk(i, 'News ' + i))]
    const f = vi.fn(async () => new Response(JSON.stringify(list), { status: 200 }))
    const out = await loadNews({ VITE_SUPABASE_URL: 'https://x.supabase.test' }, f as unknown as typeof fetch)
    expect(out?.map((n) => n.id)).toEqual(['1', '2', '3', '4', '5'])
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('limit=40')
  })
  it('drops bid and procurement notices and still returns 5', async () => {
    const mk = (id: string, title: string, source = 'PIA') => ({ id, title, url: 'https://a.test/' + id, source, kind: 'article', published_at: '2026-10-17T00:00:00Z' })
    const list = [mk('b1', 'Invitation to Bid for road works'), mk('b2', 'Ref (123456789-AB) tender'), mk('b3', 'Notice', 'Procurement Service'), ...['1', '2', '3', '4', '5', '6'].map((i) => mk(i, 'News ' + i))]
    const f = vi.fn(async () => new Response(JSON.stringify(list), { status: 200 }))
    const out = await loadNews({ VITE_SUPABASE_URL: 'https://x.supabase.test' }, f as unknown as typeof fetch)
    expect(out?.map((n) => n.id)).toEqual(['1', '2', '3', '4', '5'])
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('limit=40')
  })
  it('the offline fallback drops bid notices too', async () => {
    await db.kv.put({ key: 'safety.news', value: [{ ...rows[0], id: 'x', title: 'Notice of Award' }, rows[0]] })
    const out = await loadNews({ VITE_SUPABASE_URL: 'https://x.supabase.test' }, (async () => { throw new Error('offline') }) as unknown as typeof fetch)
    expect(out?.map((n) => n.id)).toEqual(['1'])
  })
  it('safeUrl', () => {
    expect(safeUrl('https://a.b')).toBe(true)
    expect(safeUrl('javascript:x')).toBe(false)
  })
})
