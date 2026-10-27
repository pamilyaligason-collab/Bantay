import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../db'
import { ldb } from '../../log/store'
import Cook, { clock } from './Cook'
import { MEDCARDS, RECIPES, sodiumPerServing } from './data'
import MedCard from './MedCard'
import Meds from './Meds'
import Recipe from './Recipe'
import Recipes from './Recipes'
import Screen from './Screen'

beforeEach(async () => { location.hash = '#discover/learn'; await Promise.all([db.kv.clear(), ldb.medications.clear()]) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('content', () => {
  it('has the 15 cards and 20 recipes the lane promises', () => {
    expect(MEDCARDS.length).toBe(15)
    expect(RECIPES.length).toBe(20)
  })
  it('every card has a do-not-mix list that never claims "no interactions", side effects and an emergency line', () => {
    for (const c of MEDCARDS) {
      expect(c.noMix.length, c.id).toBeGreaterThan(0)
      expect(JSON.stringify(c), c.id).not.toMatch(/no interactions?|no known interactions?|nothing to mix/i)
      expect(c.side.length, c.id).toBeGreaterThan(0)
      expect(c.emergency.length, c.id).toBeGreaterThan(10)
      expect(JSON.stringify(c), c.id).not.toMatch(/—|–/) // no em or en dashes
    }
    expect(MEDCARDS.filter((c) => c.kind !== 'medicine').every((c) => c.evidence)).toBe(true)
  })
  it('salt per serving matches hand-added values (ML-17)', () => {
    const by = (id: string) => RECIPES.find((r) => r.id === id)!
    expect(sodiumPerServing(by('sinigang-isda'))).toBe(240) // (300+20+40+10+15+100+470) / 4 = 238.75
    expect(sodiumPerServing(by('kalabasa-soup'))).toBe(80) // (10+10+15+290+0) / 4 = 81.25
    expect(sodiumPerServing(by('tokwa-gulay'))).toBe(210) // (20+160+80+10+575) / 4 = 211.25
    for (const r of RECIPES) { expect(sodiumPerServing(r), r.id).toBeLessThanOrEqual(600); expect(r.steps.length, r.id).toBeGreaterThanOrEqual(4) }
  })
  it('the lane data is far under the 3 MB bundle budget', () => { expect(JSON.stringify([MEDCARDS, RECIPES]).length).toBeLessThan(3 * 1024 * 1024) })
  it('every step timer has a sensible length', () => {
    for (const r of RECIPES) for (const s of r.steps) if (typeof s !== 'string') expect(s[1], r.id).toBeGreaterThan(0)
  })
})

describe('medicine cards', () => {
  it('every card shows the Talk to your doctor first line, do not mix, and its sources', () => {
    for (const c of MEDCARDS) {
      const { unmount } = render(<MedCard id={c.id} />)
      expect(screen.getByTestId('doctor').textContent, c.id).toContain('Talk to your doctor first')
      expect(screen.getByTestId('nomix').textContent, c.id).toContain('Do not mix with')
      expect(screen.getByText(/DailyMed and openFDA/), c.id).toBeTruthy()
      expect(screen.getByTestId(c.kind === 'medicine' ? 'medcard' : 'suppcard'), c.id).toBeTruthy()
      unmount()
    }
  })
  it('a supplement card shows the evidence level', () => {
    render(<MedCard id="malunggay" />)
    expect(screen.getByRole('img', { name: 'Little evidence' })).toBeTruthy()
  })
  it('an unknown id says so instead of crashing', () => {
    render(<MedCard id="nope" />)
    expect(screen.getByText('We do not have that card.')).toBeTruthy()
  })
})

describe('Learn screen and the learn.medcards flag', () => {
  it('flag off (default): recipes show, medicine wiki is hidden, and a direct medicine link falls back to home', async () => {
    location.hash = '#discover/learn/med/losartan'
    render(<Screen />)
    expect(await screen.findByText('Healthy recipes')).toBeTruthy()
    expect(screen.queryByText('Medicine wiki')).toBeNull()
    expect(screen.queryByTestId('medcard')).toBeNull()
  })
  it('flag on: medicine wiki and the card open', async () => {
    await db.kv.put({ key: 'learn.medcards', value: true })
    location.hash = '#discover/learn/med/losartan'
    render(<Screen />)
    expect(await screen.findByTestId('medcard')).toBeTruthy()
    cleanup()
    location.hash = '#discover/learn'
    render(<Screen />)
    expect(await screen.findByText('Medicine wiki')).toBeTruthy()
  })
  it('recipes and cook mode show with the flag off', async () => {
    location.hash = '#discover/learn/recipe/sinigang-isda'
    const { unmount } = render(<Screen />)
    expect(await screen.findByTestId('recipe')).toBeTruthy()
    unmount()
    location.hash = '#discover/learn/cook/sinigang-isda'
    render(<Screen />)
    expect(await screen.findByTestId('cook')).toBeTruthy()
  })
})

describe('medicine list', () => {
  it("Mama's medicines lists the live rows that have a card, and says so when one has none", async () => {
    await ldb.medications.bulkAdd([
      { personId: 'p1', name: 'Losartan 50mg tab', strength: '50 mg', medStatus: 'active' },
      { personId: 'p1', name: 'Zorbex', medStatus: 'active' },
      { personId: 'p1', name: 'Amlodipine', medStatus: 'stopped' }
    ])
    render(<Meds />)
    const mine = await screen.findByTestId('mine')
    await waitFor(() => expect(within(mine).getByText('No card yet. Ask your pharmacist.')).toBeTruthy())
    expect(within(mine).getByRole('link').getAttribute('href')).toBe('#discover/learn/med/losartan')
    expect(within(mine).queryByText(/Amlodipine/)).toBeNull()
  })
  it('search and kind chips narrow the full list', () => {
    render(<Meds />)
    const all = () => within(screen.getByTestId('all')).queryAllByRole('link')
    expect(all().length).toBe(15)
    fireEvent.click(screen.getByRole('button', { name: 'Herbal' }))
    expect(all().map((a) => a.textContent)).toEqual([expect.stringContaining('Malunggay')])
    fireEvent.click(screen.getByRole('button', { name: 'Herbal' }))
    fireEvent.change(screen.getByLabelText('Search medicines'), { target: { value: 'ZYRTEC' } })
    expect(all().length).toBe(1)
  })
})

describe('recipes', () => {
  it('lists all 20 with salt per serving, and a filter narrows it', () => {
    render(<Recipes />)
    expect(screen.getAllByTestId('recipe-card')).toHaveLength(20)
    expect(within(screen.getAllByTestId('recipe-card')[0]).getByText('240 mg sodium')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Soft food' }))
    const n = RECIPES.filter((r) => r.tags.includes('soft')).length
    expect(screen.getAllByTestId('recipe-card')).toHaveLength(n)
    expect(n).toBeGreaterThan(3)
  })
  it('the recipe page shows salt against the 1,500 mg day, the usual version, swaps and steps', () => {
    render(<Recipe id="sinigang-isda" />)
    const salt = screen.getByTestId('salt')
    expect(salt.textContent).toContain('240 mg')
    expect(salt.textContent).toContain('1,500 mg day')
    expect(salt.textContent).toContain('16 percent')
    expect(salt.textContent).toContain('usual version is about 470 mg')
    expect(screen.getByText('Instead of a ready-made sinigang mix, which is salty')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Cook mode/ }).getAttribute('href')).toBe('#discover/learn/cook/sinigang-isda')
  })
})

describe('cook mode', () => {
  const lock = () => ({ released: false, release: vi.fn(async () => undefined), addEventListener: vi.fn() })
  it('an unknown recipe shows a Back link that works: the app is not made inert', () => {
    const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root)
    try {
      render(<Cook id="no-such-recipe" />, { container: root })
      expect(screen.getByText('We do not have that recipe.')).toBeTruthy()
      expect(root.hasAttribute('inert')).toBe(false)
    } finally { root.remove() }
  })
  it('shows one step at a time and walks back and forward', () => {
    render(<Cook id="sinigang-isda" />)
    expect(screen.getByTestId('cook-step').textContent).toBe('Step 1 of 4')
    expect(screen.getByRole('button', { name: /Back/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByTestId('cook-step').textContent).toBe('Step 2 of 4')
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByTestId('cook-step').textContent).toBe('Step 1 of 4')
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Done/ }).getAttribute('href')).toBe('#discover/learn/recipe/sinigang-isda')
  })
  it('the step timer starts with one tap, counts down, and says when time is up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    render(<Cook id="sinigang-isda" />)
    expect(screen.queryByTestId('timer')).toBeNull() // step 1 has no time
    fireEvent.click(screen.getByRole('button', { name: /Next/ })) // step 2: 8 minutes
    const t = screen.getByTestId('timer')
    expect(t.textContent).toBe('Start 8 minute timer')
    fireEvent.click(t)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(t.textContent).toBe('7:00 left. Tap to pause')
    act(() => { vi.advanceTimersByTime(7 * 60_000) })
    expect(t.textContent).toBe('Time is up. Tap to reset')
    fireEvent.click(t)
    expect(t.textContent).toBe('Start 8 minute timer')
  })
  it('asks for the screen wake lock while open and lets it go on leave', async () => {
    const l = lock()
    const request = vi.fn(async () => l)
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { wakeLock: { request } }))
    const { unmount } = render(<Cook id="sinigang-isda" />)
    await waitFor(() => expect(screen.getByText('Cook mode, screen stays on')).toBeTruthy())
    expect(request).toHaveBeenCalledWith('screen')
    unmount()
    expect(l.release).toHaveBeenCalled()
  })
  it('works, and says only "Cook mode", where the Wake Lock API is missing or refused', async () => {
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { wakeLock: { request: vi.fn(async () => { throw new Error('denied') }) } }))
    render(<Cook id="sinigang-isda" />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('Cook mode')).toBeTruthy()
    expect(screen.queryByText('Cook mode, screen stays on')).toBeNull()
  })
  it('formats the clock as m:ss', () => { expect(clock(0)).toBe('0:00'); expect(clock(65)).toBe('1:05'); expect(clock(480)).toBe('8:00') })
})
