import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'

const { stub } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }) }))
vi.mock('../features/notify/AlertsBanner', () => stub('alerts'))
vi.mock('../features/today/AlertBand', () => stub('alertband'))
vi.mock('../features/today/GreetingBand', () => ({ default: () => <button type="button">I&apos;m OK</button> }))
vi.mock('../features/today/useDueMeds', () => ({ useDueMeds: () => ({ due: [{ personId: 'me', name: 'Lloyd', isMe: true, at: 480, status: 'upcoming', slots: [{ name: 'Losartan', slot: '08:00', at: 480, medicationId: 'm1', key: 'm1', personId: 'me', dose: null }] }], review: 0, tick: new Date() }), markDue: async () => true }))
vi.mock('../features/today/WeatherCard', () => stub('weather'))
vi.mock('../features/today/MyWeek', () => stub('myweek'))
vi.mock('../features/today/FamilyLine', () => stub('famline'))
vi.mock('../features/today/NearbyList', () => stub('nearby'))
vi.mock('../features/today/NextUp', () => stub('nextup'))
vi.mock('../features/today/PlanToday', () => stub('plan'))
vi.mock('../features/today/QuickLog', () => stub('quicklog'))
vi.mock('../features/today/WeekLine', () => stub('week'))
vi.mock('../features/update/PwaBanner', () => ({ PwaBanner: () => null }))
vi.mock('../features/update/UpdateCard', () => ({ UpdateCard: () => null }))
import Today from './Today'

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('Today simple mode', () => {
  it('off: the full page', async () => {
    render(<Today />)
    await screen.findByTestId('quicklog')
    for (const id of ['alertband', 'nextup', 'weather', 'myweek', 'famline', 'plan', 'week']) expect(screen.getByTestId(id)).toBeTruthy()
    for (const id of ['news', 'video', 'movement', 'walk']) expect(screen.queryByTestId(id)).toBeNull() // News lives in Safety; walk is a sheet from the quick-log row
    expect(screen.queryByRole('link', { name: 'SOS' })).toBeNull()
  })
  it('full page order: Next up, weather, quick log, My week, family line, plan, then More', async () => {
    const { container } = render(<Today />)
    await screen.findByTestId('quicklog')
    const ids = [...container.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['alertband', 'nextup', 'weather', 'quicklog', 'myweek', 'famline', 'plan', 'alerts', 'nearby', 'week'])
  })
  it('on: the next dose with a big Taken, then three big buttons', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    await screen.findByRole('button', { name: 'Taken' })
    expect(screen.getByText('Time for Losartan')).toBeTruthy()
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'SOS' }).getAttribute('href')).toBe('#safety')
    expect(screen.getByRole('link', { name: 'Add a family number' }).getAttribute('href')).toBe('#safety') // no SOS contact saved yet
    for (const id of ['quicklog', 'nextup', 'plan', 'week', 'nearby', 'myweek', 'famline']) expect(screen.queryByTestId(id)).toBeNull()
  })
  it('on with an SOS contact: Call family dials the first valid number', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    await db.kv.put({ key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] })
    render(<Today />)
    const call = await screen.findByRole('link', { name: 'Call family' })
    expect(call.getAttribute('href')).toBe('tel:+639171234567')
  })
})
