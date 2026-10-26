import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'

const { stub, storm, meds } = vi.hoisted(() => ({ meds: { due: true, review: 0 }, storm: { v: null as null | { title: string; body: string } }, stub: (id: string) => ({ default: () => <div data-testid={id} /> }) }))
vi.mock('../features/notify/AlertsBanner', () => stub('alerts'))
vi.mock('../features/today/AlertBand', () => stub('alertband'))
vi.mock('../features/today/GreetingBand', () => ({ default: () => <button type="button">I&apos;m OK</button> }))
vi.mock('../features/today/useDueMeds', () => ({ useDueMeds: () => ({ due: !meds.due ? [] : [{ personId: 'me', name: 'Lloyd', isMe: true, at: 480, status: 'upcoming', slots: [{ name: 'Losartan', slot: '08:00', at: 480, medicationId: 'm1', key: 'm1', personId: 'me', dose: null }] }], review: meds.review, tick: new Date() }), markDue: async () => true }))
vi.mock('../features/today/useStorm', () => ({ useStorm: () => storm.v }))
vi.mock('../features/today/WeatherCard', () => ({ default: ({ expanded, review }: { expanded?: boolean; review?: number }) => <div data-testid="weather" data-expanded={String(!!expanded)} data-review={review} /> }))
vi.mock('../features/today/MyWeek', () => stub('myweek'))
vi.mock('../features/today/SelfCare', () => stub('selfcare'))
vi.mock('../features/today/NearbyList', () => stub('nearby'))
vi.mock('../features/today/NextUp', () => stub('nextup'))
vi.mock('../features/today/PlanToday', () => stub('plan'))
vi.mock('../features/today/QuickLog', () => stub('quicklog'))
vi.mock('../features/today/WeekLine', () => stub('week'))
vi.mock('../features/update/PwaBanner', () => ({ PwaBanner: () => null }))
vi.mock('../features/update/UpdateCard', () => ({ UpdateCard: () => null }))
import Today from './Today'

beforeEach(async () => { await db.kv.clear(); meds.due = true; meds.review = 0 })
afterEach(cleanup)

describe('Today simple mode', () => {
  it('off: the full page', async () => {
    render(<Today />)
    await screen.findByTestId('quicklog')
    for (const id of ['alertband', 'nextup', 'weather', 'myweek', 'selfcare', 'plan', 'week']) expect(screen.getByTestId(id)).toBeTruthy()
    for (const id of ['news', 'video', 'movement', 'walk']) expect(screen.queryByTestId(id)).toBeNull() // News lives in Safety; walk is a sheet from the quick-log row
    expect(screen.queryByRole('button', { name: /^SOS/ })).toBeNull()
  })
  it('full page order: Next up, weather, quick log, My week, family line, plan, then More', async () => {
    const { container } = render(<Today />)
    await screen.findByTestId('quicklog')
    const ids = [...container.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['alertband', 'nextup', 'weather', 'quicklog', 'myweek', 'selfcare', 'plan', 'alerts', 'nearby', 'week'])
  })
  it('a dose due: Next up comes first and the weather card stays compact', async () => {
    render(<Today />)
    await screen.findByTestId('quicklog')
    expect(screen.getByTestId('weather').getAttribute('data-expanded')).toBe('false')
  })
  it('calm: no Next up card, the weather card is expanded and gets the medicines count; no empty card in between', async () => {
    meds.due = false; meds.review = 3
    const { container } = render(<Today />)
    await screen.findByTestId('quicklog')
    expect(screen.queryByTestId('nextup')).toBeNull()
    expect(screen.getByTestId('weather').getAttribute('data-expanded')).toBe('true')
    expect(screen.getByTestId('weather').getAttribute('data-review')).toBe('3')
    expect([...container.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).slice(0, 3)).toEqual(['alertband', 'weather', 'quicklog'])
  })
  it('on, calm: the expanded weather card replaces the empty Next up card; no Taken button', async () => {
    meds.due = false
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    expect((await screen.findByTestId('weather')).getAttribute('data-expanded')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Taken' })).toBeNull()
    expect(screen.queryByText('All clear')).toBeNull()
  })
  it('on: .bt gets data-simple (CSS hides the tab bar and coach mark); off again on exit', async () => {
    const bt = document.body.appendChild(document.createElement('div'))
    bt.className = 'bt'
    await db.kv.put({ key: 'mode.simple', value: true })
    const { unmount } = render(<Today />)
    await screen.findAllByRole('button', { name: /^Exit/ })
    expect(bt.hasAttribute('data-simple')).toBe(true)
    unmount()
    expect(bt.hasAttribute('data-simple')).toBe(false)
    bt.remove()
  })
  it('on: Exit (top) and Exit simple mode (bottom) both turn it off through the same switch as Me', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    const { unmount } = render(<Today />)
    const buttons = await screen.findAllByRole('button', { name: /^Exit/ })
    expect(buttons.map((b) => b.textContent)).toEqual(['Exit', 'Exit simple mode'])
    fireEvent.click(buttons[1]!)
    await screen.findByTestId('quicklog') // the full page is back
    expect((await db.kv.get('mode.simple'))?.value).toBe(false)
    unmount()
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    fireEvent.click((await screen.findAllByRole('button', { name: /^Exit/ }))[0]!)
    await screen.findByTestId('quicklog')
  })
  it('on: the next dose with a big Taken, then three big buttons', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    await screen.findByRole('button', { name: 'Taken' })
    expect(screen.getByText('Losartan')).toBeTruthy()
    expect(screen.getByRole('button', { name: "I'm OK" })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^SOS/ })).toBeTruthy() // the real hold-to-send button, not a link
    expect(screen.getByRole('link', { name: 'Add a family number' }).getAttribute('href')).toBe('#safety') // no SOS contact saved yet
    for (const id of ['quicklog', 'nextup', 'plan', 'week', 'nearby', 'myweek', 'selfcare']) expect(screen.queryByTestId(id)).toBeNull()
  })
  it('on: the warning band and a storm within 500 km are not lost', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    storm.v = { title: 'Pepito is near', body: 'about 400 km east of you' }
    render(<Today />)
    await screen.findByRole('button', { name: 'Taken' })
    expect(screen.getByTestId('alertband')).toBeTruthy()
    storm.v = null
  })
  it('on with an SOS contact: Call family dials the first valid number', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    await db.kv.put({ key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] })
    render(<Today />)
    const call = await screen.findByRole('link', { name: 'Call family' })
    expect(call.getAttribute('href')).toBe('tel:+639171234567')
  })
})
