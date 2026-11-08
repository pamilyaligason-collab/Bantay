import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { articleHref } from './medline'

vi.mock('../../auth/client', () => ({ supabase: null }))
vi.mock('../../auth/session', () => ({ getAccessToken: async () => null, getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

import Library from './Library'
import Article from './Article'
import { hdb } from '../../records/store'
import { resetPersonChoice } from '../../records/useHealthData'

const SLOW = { timeout: 8000 }
beforeEach(async () => {
  resetPersonChoice()
  await Promise.all([db.kv.clear(), hdb.people.clear()])
  await hdb.people.put({ id: 'p1', name: 'Maria Sample' })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline'))) // everything below must work with no network
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })

describe('the offline library, with no network', () => {
  it('home: header count, 3x3 body grid and the Common in the Philippines list, with no network call', async () => {
    location.hash = '#health/library'
    render(<Library />)
    expect((await screen.findByText(/topics in plain words/, {}, SLOW)).textContent).toMatch(/^\d{3} topics in plain words\. Works without internet\.$/)
    const tiles = within(screen.getByTestId('lib-body')).getAllByRole('link')
    expect(tiles.map((a) => a.textContent?.slice(0, 5))).toHaveLength(9)
    expect(tiles[0]!.getAttribute('href')).toBe('#health/library/b%3Aheart')
    expect(screen.getByRole('heading', { name: 'Common in the Philippines' })).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('a Tagalog word finds the topic and links to its article', async () => {
    location.hash = '#health/library'
    render(<Library />)
    const box = await screen.findByRole('searchbox')
    await screen.findByText(/topics in plain words/, {}, SLOW)
    fireEvent.change(box, { target: { value: 'altapresyon' } })
    const link = await screen.findByRole('link', { name: /High blood pressure/i })
    expect(link.getAttribute('href')).toBe('#health/library/e%3Ahypertension')
    fireEvent.change(box, { target: { value: 'zzzxqq' } })
    expect(await screen.findByTestId('lib-none')).toBeTruthy()
  })

  it('a body filter lists only that body', async () => {
    location.hash = '#health/library/b%3Afirstaid'
    render(<Library />)
    const list = await screen.findByTestId('body-list')
    await within(list).findByRole('link', { name: /Choking/ }, SLOW)
    expect(within(list).queryByRole('link', { name: /^Asthma/ })).toBeNull()
  })

  it('the dengue article: order, red hospital box, folded sections, credits behind one link, footer', async () => {
    location.hash = '#health/library/e%3Adengue'
    render(<Library />)
    await screen.findByRole('heading', { name: 'Dengue' }, SLOW)
    const art = screen.getByTestId('article')
    const heads = within(art).getAllByRole('heading').map((h) => h.textContent)
    expect(heads.slice(0, 3)).toEqual(['Dengue', 'In short', 'Call 911 or go to the hospital now if'])
    expect(within(art).getAllByRole('listitem').length).toBeGreaterThan(8)
    expect(within(art).getByTestId('article-short').querySelectorAll('li')).toHaveLength(3)
    const sections = Array.from(art.querySelectorAll('details.ax-sec'))
    expect(sections.map((d) => d.querySelector('summary')!.textContent)).toEqual(['What it is', 'Signs', 'What helps at home', 'Prevent it'])
    expect(sections.map((d) => (d as HTMLDetailsElement).open)).toEqual([true, false, false, false])
    expect(within(art).getByText('Sources and picture credits')).toBeTruthy()
    expect(within(art).getByText('Written in plain words for Bantay, based on MedlinePlus.gov. Not medical advice. In an emergency call 911.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('Enter on a word we have opens the top offline topic and never calls the network', async () => {
    location.hash = '#health/library'
    render(<Library />)
    const box = await screen.findByRole('searchbox')
    await screen.findByText(/topics in plain words/, {}, SLOW)
    fireEvent.change(box, { target: { value: 'dengue' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(location.hash).toBe('#health/library/e%3Adengue')
    fireEvent.change(box, { target: { value: 'ubo' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(location.hash).toBe('#health/library/e%3Acough')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('Enter on a word we do not have goes to the online MedlinePlus look-up, and the button says it needs internet', async () => {
    location.hash = '#health/library'
    render(<Library />)
    const box = await screen.findByRole('searchbox')
    await screen.findByText(/topics in plain words/, {}, SLOW)
    fireEvent.change(box, { target: { value: 'zzzxqq' } })
    expect(screen.getByRole('button', { name: /MedlinePlus online \(needs internet\)/ })).toBeTruthy()
    fireEvent.submit(screen.getByRole('search'))
    await vi.waitFor(() => expect(location.hash).toBe(articleHref('s', 'zzzxqq')))
  })

  it('"For <person>" chips: a condition we have opens the offline topic, one we do not goes to MedlinePlus Connect', async () => {
    await db.profiles.put({ id: 'p1', photoPath: null, phone: null, birthdate: null, bloodType: null, allergies: [], conditions: ['High blood pressure', 'Sarcoidosis'], medicines: [], updatedAt: null } as never)
    location.hash = '#health/library'
    render(<Library />)
    const chips = await screen.findByTestId('lib-for', {}, SLOW)
    await vi.waitFor(() => expect(within(chips).getByRole('link', { name: /High blood pressure/i }).getAttribute('href')).toBe('#health/library/e%3Ahypertension'), SLOW)
    expect(within(chips).getByRole('link', { name: /Sarcoidosis/ }).getAttribute('href')).toBe(articleHref('c', 'Sarcoidosis'))
  })

  it('the dengue article shows the picture and the Watch section, with the credit only behind "Sources and picture credits"', async () => {
    location.hash = '#health/library/e%3Adengue'
    render(<Library />)
    await screen.findByRole('heading', { name: 'Dengue' }, SLOW)
    const art = screen.getByTestId('article')
    expect(art.querySelector('img.ax-pic')?.getAttribute('src')).toBe('/img/medlib/dengue.webp')
    const watch = within(art).getByTestId('article-watch')
    expect(within(watch).getByRole('heading', { name: 'Watch' })).toBeTruthy()
    expect(watch.querySelectorAll('.ax-vid').length).toBeGreaterThanOrEqual(1)
    const credits = art.querySelector('details.ax-credits') as HTMLDetailsElement
    expect(credits.open).toBe(false)
    expect(credits.contains(within(art).getByTestId('picture-credit'))).toBe(true)
    expect(art.querySelectorAll('[data-testid="picture-credit"]')).toHaveLength(1)
    expect(Array.from(art.children).filter((c) => c !== credits).map((c) => c.textContent).join(' ')).not.toMatch(/Wee Hong|CC BY/) // no credit under the picture
  })

  it('a body filter also works when the Discover route hands the b: key to Article', async () => {
    render(<Article rawKey="b:firstaid" />)
    const list = await screen.findByTestId('body-list')
    await within(list).findByRole('link', { name: /Choking/ }, SLOW)
  })

  it('an f: article says it is not on this phone when the full library is not on the phone', async () => {
    location.hash = '#health/library/f%3Aanything'
    render(<Library />)
    expect(await screen.findByText("Not in this phone's library", {}, SLOW)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Library' }).getAttribute('href')).toBe('#health/library')
  })
})
