import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getAccessToken: async () => null, getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../records/trend', () => ({ trendChart: () => ({ destroy() {}, setSize() {} }) })) // uPlot needs a canvas
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })

import Health from '../../screens/Health'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetPersonChoice } from '../records/useHealthData'
import { WATER_TIP } from './trendLogic'

const noonAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString() }
const glass = (ago: number, i: number) => ({ clientId: `w${ago}-${i}`, personId: 'p1', drunkAt: noonAgo(ago), ml: 250 })
const reading = (test: string, value: number, unit: string, ago: number) => ({ personId: 'p1', test, value, unit, takenAt: noonAgo(ago) })

beforeEach(async () => {
  resetPersonChoice()
  await Promise.all([db.kv.clear(), db.outbox.clear(), hdb.readings.clear(), hdb.people.clear(), ldb.water.clear(), ldb.goals.clear()])
  await hdb.people.put({ id: 'p1', name: 'Maria Sample' })
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('#health/metric/water (the Water tile page)', () => {
  it('route renders the Water page: today against the goal, the 7-day average on logged days, the tip, a way back', async () => {
    await ldb.water.bulkAdd([glass(0, 0), glass(0, 1), glass(0, 2), glass(1, 0), glass(1, 1)])
    location.hash = '#health/metric/water'
    render(<Health />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Water' })).toBeTruthy()
    const hero = await screen.findByTestId('water-hero')
    await waitFor(() => expect(hero.textContent).toMatch(/3\/\d+/))
    expect(hero.textContent).toContain('glasses today')
    expect(hero.className).toContain('card')
    expect(hero.className).toContain('tint')
    expect(hero.getAttribute('data-hue')).toBe('blue')
    expect(hero.querySelector('.cd-kicker')?.textContent).toBe('Today')
    expect(hero.querySelector('.cd-value')).toBeTruthy()
    expect(hero.querySelector('svg.rg')).toBeTruthy() // the ring; the number is text beside it
    expect(screen.getByTestId('water-summary').textContent).toContain('Average over the last 7 days: 2.5 glasses a day, from 2 days with a drink logged.') // (3 + 2) / 2, days with nothing are not 0
    expect(screen.getByTestId('water-tip').textContent).toContain(WATER_TIP)
    expect(screen.getByTestId('water-tip').textContent).toContain('not medical advice')
    expect(screen.getByRole('link', { name: 'Log water in Nutrition' }).getAttribute('href')).toBe('#health/nutrition')
    expect(screen.getByRole('link', { name: /Health/ }).getAttribute('href')).toBe('#health')
    expect(screen.getByTestId('metric-chart')).toBeTruthy()
  })

  it('nothing logged: "--" and a plain line, no ring, no summary, no chart (never a zero)', async () => {
    location.hash = '#health/metric/water'
    render(<Health />)
    const hero = await screen.findByTestId('water-hero')
    expect(hero.textContent).toContain('--')
    expect(hero.textContent).toContain('Nothing logged today yet.')
    expect(hero.querySelector('svg.rg')).toBeNull()
    expect(screen.queryByTestId('water-summary')).toBeNull()
    expect(screen.queryByTestId('metric-chart')).toBeNull()
    expect(screen.queryByTestId('water-tip')).toBeNull()
  })

  it('a glass logged for someone else is not counted on this page', async () => {
    await ldb.water.bulkAdd([glass(0, 0), { ...glass(0, 1), personId: 'p2' }, { ...glass(0, 2), personId: 'p2' }])
    location.hash = '#health/metric/water'
    render(<Health />)
    const hero = await screen.findByTestId('water-hero')
    await waitFor(() => expect(hero.textContent).toMatch(/1\/\d+/))
  })
})

describe('vital heroes: blood pressure and pulse', () => {
  it('BP: the hero is a tinted card with the latest pair and the 7-day average line with the guide', async () => {
    await hdb.readings.bulkAdd([reading('bp_systolic', 124, 'mmHg', 1), reading('bp_diastolic', 79, 'mmHg', 1), reading('bp_systolic', 136, 'mmHg', 6), reading('bp_diastolic', 88, 'mmHg', 6)])
    location.hash = '#health/metric/bp_systolic'
    render(<Health />)
    const hero = await screen.findByTestId('vital-hero')
    expect(hero.className).toContain('card')
    expect(hero.getAttribute('data-hue')).toBe('blue')
    expect(within(hero).getByText(/^Latest/).className).toContain('cd-kicker')
    expect(hero.querySelector('.cd-value')?.textContent).toContain('124/79')
    const s = within(hero).getByTestId('vital-summary').textContent!
    expect(s).toContain('Average over the last 7 days: 130/84 mmHg, from 2 days with a reading.') // (124 + 136) / 2 and (79 + 88) / 2 = 83.5
    expect(s).toContain('General guide for adults')
  })

  it('pulse: the line names its unit as "beats a minute" and the hero is a tinted card', async () => {
    await hdb.readings.bulkAdd([reading('heart_rate', 72, 'bpm', 1), reading('heart_rate', 78, 'bpm', 2)])
    location.hash = '#health/metric/heart_rate'
    render(<Health />)
    const hero = await screen.findByTestId('vital-hero')
    expect(hero.getAttribute('data-hue')).toBe('terra')
    const s = within(hero).getByTestId('vital-summary').textContent!
    expect(s).toContain('Average over the last 7 days: 75 beats a minute, from 2 days with a reading.')
    expect(s).not.toMatch(/\bbpm\b/)
  })

  it('no readings: no summary line (never an average of nothing)', async () => {
    location.hash = '#health/metric/heart_rate'
    render(<Health />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByTestId('vital-summary')).toBeNull()
  })
})
