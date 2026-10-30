import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'

const { stub, storm, meds, feel, sosb } = vi.hoisted(() => ({ sosb: { on: false }, feel: { r: 'told' as string, calls: [] as string[] }, meds: { due: true, review: 0 }, storm: { v: null as null | { title: string; body: string } }, stub: (id: string) => ({ default: () => <div data-testid={id} /> }) }))
vi.mock('../features/notify/AlertsBanner', () => stub('alerts'))
vi.mock('../features/today/AlertBand', () => stub('alertband'))
vi.mock('../features/today/WarningCard', () => ({ default: () => <div data-testid="alertband" />, useWarnings: () => ({ onScreen: false, storm: null }) }))
vi.mock('../features/setup/steps', () => ({ useSetupLeft: () => ({ left: [] }), turnOnReminders: async () => undefined, notifyState: async () => ({}), notifyDone: () => false }))
vi.mock('../features/notify/AlertCardToday', () => ({ AlertCardToday: () => <div data-testid="alertcard" /> }))
vi.mock('../features/phonecheck/AlarmFixedToast', () => ({ AlarmFixedToast: () => null }))
vi.mock('../features/today/useDueMeds', () => ({ useDueMeds: () => ({ due: !meds.due ? [] : [{ personId: 'me', name: 'Lloyd', isMe: true, at: 480, status: 'upcoming', slots: [{ name: 'Losartan', slot: '08:00', at: 480, medicationId: 'm1', key: 'm1', personId: 'me', dose: null }] }], review: meds.review, tick: new Date() }), markDue: async () => true }))
vi.mock('../features/today/useStorm', () => ({ useStorm: () => storm.v }))
vi.mock('../features/today/WeatherCard', () => ({ default: ({ expanded, review, noJack }: { expanded?: boolean; review?: number; noJack?: boolean }) => <div data-testid="weather" data-expanded={String(!!expanded)} data-review={review} data-nojack={String(!!noJack)} /> }))
vi.mock('../features/family/IncomingSos', () => ({ IncomingSos: () => (sosb.on ? <div data-testid="incoming-sos" /> : null) }))
vi.mock('../features/family/sosActive', () => ({ useSosActive: () => sosb.on }))
vi.mock('../features/today/SeeWeek', () => stub('seeweek'))
vi.mock('../features/today/SelfCare', () => stub('selfcare'))
vi.mock('../features/today/NearbyList', () => stub('nearby'))
vi.mock('../features/today/NextUp', () => stub('nextup'))
vi.mock('../features/today/PlanToday', () => stub('plan'))
vi.mock('../features/today/QuickLog', () => stub('quicklog'))
vi.mock('../features/today/WeekLine', () => stub('week'))
vi.mock('../features/today/actions', async (orig) => ({ ...(await orig<typeof import('../features/today/actions')>()), logFeeling: async (f: string) => { feel.calls.push(f); return feel.r } }))
vi.mock('../features/setup/useProfile', async (orig) => ({ ...(await orig<typeof import('../features/setup/useProfile')>()), useSelfPersonId: () => 'me' }))
vi.mock('../features/update/PwaBanner', () => ({ PwaBanner: () => null }))
vi.mock('../features/update/UpdateCard', () => ({ UpdateCard: () => null }))
import Today from './Today'

beforeEach(async () => { await db.kv.clear(); meds.due = true; meds.review = 0; sosb.on = false })
afterEach(cleanup)

describe('Today simple mode', () => {
  it('off: the full page', async () => {
    render(<Today />)
    await screen.findByTestId('quicklog')
    for (const id of ['alertband', 'nextup', 'weather', 'seeweek', 'selfcare', 'plan', 'week']) expect(screen.getByTestId(id)).toBeTruthy()
    for (const id of ['news', 'video', 'movement', 'walk']) expect(screen.queryByTestId(id)).toBeNull() // News lives in Safety; walk is a sheet from the quick-log row
    expect(screen.queryByRole('button', { name: /^SOS/ })).toBeNull()
  })
  it('off: Hold for help sits on Today (the same hold button as Simple mode), right under the quick log and above self-care, so the Jack button at the bottom never covers it', async () => {
    const { container } = render(<Today />)
    await screen.findByTestId('quicklog')
    const sos = screen.getByRole('button', { name: 'Hold to call and text your family' })
    const order = [...container.querySelectorAll('[data-testid], .td-sos')].map((e) => e.getAttribute('data-testid') ?? 'sos')
    expect(order.indexOf('sos')).toBe(order.indexOf('quicklog') + 1)
    expect(order.indexOf('sos')).toBeLessThan(order.indexOf('selfcare'))
    expect(sos.closest('section')?.getAttribute('aria-label')).toBe('Emergency')
  })
  it('on, a dose due: a Check my blood pressure tile opens the guided check', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    fireEvent.click(await screen.findByRole('button', { name: 'Check my blood pressure' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Medicines' })).toBeNull() // the dose card is the medicine entry
  })
  it('DS-3: Simple mode shows the family SOS banner; DS-5: no weather Jack beside it, on the full page or in Simple mode', async () => {
    sosb.on = true
    await db.kv.put({ key: 'mode.simple', value: true })
    meds.due = false
    const { unmount } = render(<Today />)
    expect(await screen.findByTestId('incoming-sos')).toBeTruthy()
    expect(screen.getByTestId('weather').getAttribute('data-nojack')).toBe('true')
    unmount()
    await db.kv.put({ key: 'mode.simple', value: false })
    render(<Today />)
    await screen.findByTestId('quicklog')
    expect(screen.getByTestId('incoming-sos')).toBeTruthy()
    expect(screen.getByTestId('weather').getAttribute('data-nojack')).toBe('true')
  })
  it('on, nothing due: Simple mode is not a dead end: a Medicines entry and the BP tile stay', async () => {
    meds.due = false
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    expect((await screen.findByRole('link', { name: 'Medicines' })).getAttribute('href')).toBe('#health/meds')
    expect(screen.getByRole('button', { name: 'Check my blood pressure' })).toBeTruthy()
  })
  it('full page order: weather, family alert card, Next up, quick log, self-care, plan, See the week, then More; no OK card, How are you? is the check-in', async () => {
    const { container } = render(<Today />)
    await screen.findByTestId('quicklog')
    const ids = [...container.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['weather', 'alertband', 'alertcard', 'nextup', 'quicklog', 'selfcare', 'plan', 'seeweek', 'alerts', 'nearby', 'week'])
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
    expect([...container.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).slice(0, 4)).toEqual(['weather', 'alertband', 'alertcard', 'quicklog'])
  })
  it('on, calm: the expanded weather card replaces the empty Next up card; no Taken button', async () => {
    meds.due = false
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    expect((await screen.findByTestId('weather')).getAttribute('data-expanded')).toBe('true')
    expect(screen.queryByRole('button', { name: 'I took it' })).toBeNull()
    expect(screen.queryByText('All clear')).toBeNull()
  })
  it('on: .bt gets data-simple (CSS hides the tab bar and coach mark); off again on exit', async () => {
    const bt = document.body.appendChild(document.createElement('div'))
    bt.className = 'bt'
    await db.kv.put({ key: 'mode.simple', value: true })
    const { unmount } = render(<Today />)
    await screen.findAllByRole('button', { name: /^Exit/ })
    await waitFor(() => expect(bt.hasAttribute('data-simple')).toBe(true))
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
  it('on: the next dose with a big I took it, Hold for help, Call 911, How are you? and a family number', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    await screen.findByRole('button', { name: 'I took it' })
    expect(screen.getByText('Losartan')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'How are you?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hold to call and text your family' })).toBeTruthy() // the real hold button, not a link
    expect(screen.getByRole('button', { name: /^Call 911/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add a family number' }).getAttribute('href')).toBe('#safety') // no SOS contact saved yet
    for (const id of ['quicklog', 'nextup', 'plan', 'week', 'nearby', 'seeweek', 'selfcare']) expect(screen.queryByTestId(id)).toBeNull()
  })
  it('on: the warning band and a storm within 500 km are not lost', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    storm.v = { title: 'Pepito is near', body: 'about 400 km east of you' }
    render(<Today />)
    await screen.findByRole('button', { name: 'I took it' })
    expect(screen.getByTestId('alertband')).toBeTruthy()
    storm.v = null
  })
  it('on with an SOS contact: Call <name> dials the first valid number', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    await db.kv.put({ key: 'sos.contacts', value: [{ name: 'Ate Joy', phone: '+63 917 123 4567' }] })
    render(<Today />)
    const call = await screen.findByRole('link', { name: 'Call Ate Joy' })
    expect(call.getAttribute('href')).toBe('tel:+639171234567')
  })
  it('on: How are you? opens the faces, Not now goes back; I took it ends on Well done with the family line', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    fireEvent.click(await screen.findByRole('button', { name: 'How are you?' }))
    expect(screen.getByRole('heading', { name: 'How are you?' })).toBeTruthy()
    expect([...document.querySelectorAll('.td-face')].map((b) => b.textContent)).toEqual(['Great', 'OK', 'Not great', 'Unwell'])
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    fireEvent.click(await screen.findByRole('button', { name: 'I took it' }))
    expect((await screen.findByRole('heading', { name: 'Well done' })).textContent).toBe('Well done')
    expect(screen.getByText('Your family will see it in Bantay.')).toBeTruthy()
  })
  it('on: a simple-mood face calls logFeeling and shows the told or untold toast', async () => {
    await db.kv.put({ key: 'mode.simple', value: true })
    render(<Today />)
    fireEvent.click(await screen.findByRole('button', { name: 'How are you?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Great' }))
    expect(await screen.findByText('Saved. Your family will see it in Bantay.')).toBeTruthy()
    feel.r = 'untold'
    fireEvent.click(await screen.findByRole('button', { name: 'How are you?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unwell' }))
    expect(await screen.findByText('Saved. We will tell them when you are online.')).toBeTruthy()
    expect(feel.calls).toEqual(['great', 'unwell'])
  })
})
