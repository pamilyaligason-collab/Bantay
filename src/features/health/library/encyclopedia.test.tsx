import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'

vi.mock('../../auth/client', () => ({ supabase: null }))
vi.mock('../../auth/session', () => ({ getAccessToken: async () => null, getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

import Library from './Library'
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
  it('home: header count, 3x3 body grid, season tag and the full-library slot is empty', async () => {
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
    const link = await screen.findByRole('link', { name: /High blood pressure/ })
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
    expect(heads.slice(0, 3)).toEqual(['Dengue', 'In short', 'Go to the hospital now if'])
    expect(within(art).getAllByRole('listitem').length).toBeGreaterThan(8)
    expect(within(art).getByTestId('article-short').querySelectorAll('li')).toHaveLength(3)
    const sections = Array.from(art.querySelectorAll('details.ax-sec'))
    expect(sections.map((d) => d.querySelector('summary')!.textContent)).toEqual(['What it is', 'Signs', 'What helps at home', 'Prevent it'])
    expect(sections.map((d) => (d as HTMLDetailsElement).open)).toEqual([true, false, false, false])
    expect(within(art).getByText('Sources and picture credits')).toBeTruthy()
    expect(within(art).getByText('From MedlinePlus.gov, in plain words. Not medical advice.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
