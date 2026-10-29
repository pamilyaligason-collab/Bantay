import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { SOS_ACTIVE_KEY, SOS_CONTACTS_KEY, startSos } from './active'
import SosScreen from './SosScreen'

const h = vi.hoisted(() => ({
  sync: vi.fn(async (_f?: boolean) => undefined),
  call: vi.fn(async (_c: unknown[], _o?: unknown) => ({ placed: true, via: 'native' as 'native' | 'tel' | 'none' })),
  listeners: [] as ((s: { isActive: boolean }) => void)[],
  request: vi.fn(),
  pid: 'p1' as string | null,
  cached: null as string | null
}))
vi.mock('./call', () => ({ callFirstContact: (c: unknown[], o?: unknown) => h.call(c, o), requestCallPermission: () => h.request() }))
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_e: string, cb: (s: { isActive: boolean }) => void) => { h.listeners.push(cb); return { remove: async () => undefined } } } }))
vi.mock('./locate', () => ({ sosPosition: async () => ({ lat: 9.65, lon: 123.85, at: 1, gps: true }) }))
vi.mock('./useSelf', () => ({ useSelf: () => ({ name: 'Lola', personId: h.pid }) }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => h.cached }))
vi.mock('../sync/sync', () => ({ syncNow: (f?: boolean) => h.sync(f) }))
vi.mock('../auth/family', () => ({ loadFamily: () => [] }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('./SosContactsPicker', () => ({ default: () => <div data-testid="picker" /> }))
vi.mock('./useAcks', () => ({ useAcks: () => 0 }))

const two = [{ name: 'Ana', phone: '0917 123 4567' }, { name: 'Ben', phone: '0918 765 4321' }]
let hrefs: string[]
beforeEach(async () => {
  await Promise.all([db.outbox.clear(), db.kv.clear()])
  h.call.mockClear(); h.sync.mockClear(); h.request.mockClear(); h.listeners.length = 0
  h.pid = 'p1'; h.cached = null
  h.call.mockImplementation(async () => ({ placed: true, via: 'native' }))
  hrefs = []
  Object.defineProperty(window, 'location', { configurable: true, value: { set href(v: string) { hrefs.push(v) }, get href() { return '' } } })
})
afterEach(cleanup)

const rows = (table: string) => db.outbox.where('table').equals(table).toArray().then((r) => r.map((x) => x.payload as Record<string, unknown>))
const goAway = () => act(() => { h.listeners.forEach((l) => l({ isActive: false })) })
const comeBack = () => act(() => { h.listeners.forEach((l) => l({ isActive: true })) })

describe('SosScreen flow', () => {
  it('records the SOS, calls the first contact, never prompts for the call permission, then opens ONE text for the first contact when the app is back', async () => {
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    const s = startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalledTimes(1))
    // 1 record: the outbox row carries the client id, the hold time, the place and the call target; no late flag, no 0 for unknown
    const [ev] = await rows('sos_events')
    expect(ev).toMatchObject({ id: s.id, personId: 'p1', at: s.at, lat: 9.65, lon: 123.85, gps: true, callTo: 'family', smsOpened: false })
    expect(ev).not.toHaveProperty('late')
    // 2 call: the first contact, as a list the helper picks from; no emergency flag; the flow never asks for the permission
    expect(h.call.mock.calls[0]![0]).toEqual(two)
    expect(h.call.mock.calls[0]![1]).toBeUndefined()
    expect(h.request).not.toHaveBeenCalled()
    expect(hrefs).toEqual([]) // the text waits for the app to come back from the call
    expect((await db.kv.get(SOS_ACTIVE_KEY))?.value).toMatchObject({ id: s.id, step: 'calling', contactIndex: 0 })
    await goAway(); await comeBack()
    // 3 text: one composer, the first contact only, with name, time and the map link
    await waitFor(() => expect(hrefs).toHaveLength(1))
    expect(hrefs[0]).toMatch(/^sms:09171234567\?body=/)
    const body = decodeURIComponent(hrefs[0]!.split('body=')[1]!)
    expect(body).toMatch(/^Lola needs help\. \d{1,2}:\d{2}.*Location: https:\/\/maps\.google\.com\/\?q=9\.65,123\.85 \(9\.65000, 123\.85000\)\. Sent from Bantay\.$/)
    expect(await rows('sos_events_update')).toEqual([{ id: s.id, smsOpened: true }]) // all the app can know: the composer opened
    await waitFor(async () => expect((await db.kv.get(SOS_ACTIVE_KEY))?.value).toMatchObject({ step: 'status' }))
    expect(screen.getByText('Text Ben')).toBeTruthy() // the second contact is a button: one composer per contact
    expect(screen.getByText('SOS saved for the family')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Your family will see this in Bantay/)
  })

  it('offline: the row waits in the outbox, the call and the composer still happen (no network call anywhere in the flow)', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalled())
    await goAway(); await comeBack()
    await waitFor(() => expect(hrefs).toHaveLength(1))
    expect((await rows('sos_events')).length).toBe(1)
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('no contact: the 911 dial screen and the contacts picker, no text, callTo 911', async () => {
    startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalledTimes(1))
    expect(h.call.mock.calls[0]).toEqual([[], { emergency: true }])
    expect((await rows('sos_events'))[0]).toMatchObject({ callTo: '911' })
    await goAway(); await comeBack()
    await screen.findByTestId('picker')
    expect(hrefs).toEqual([])
  })

  it('a call that could not be placed at all (none) goes straight to the text', async () => {
    h.call.mockImplementation(async () => ({ placed: false, via: 'none' }))
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: [two[0]] })
    startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(hrefs).toHaveLength(1)) // no foreground event needed
  })

  it('an SOS older than 10 minutes does not open the composer by itself: it is a button', async () => {
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    startSos(Date.now() - 11 * 60_000)
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalled())
    await goAway(); await comeBack()
    await waitFor(async () => expect((await db.kv.get(SOS_ACTIVE_KEY))?.value).toMatchObject({ step: 'status' }))
    expect(hrefs).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Text Ana/ }))
    expect(hrefs).toHaveLength(1)
    expect(hrefs[0]).toMatch(/^sms:09171234567/)
  })

  it('a WebView restart mid-flow resumes on the status screen: no second row, no second call, no automatic text', async () => {
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    await db.kv.put({ key: SOS_ACTIVE_KEY, value: { id: 'e-old', step: 'calling', at: new Date(Date.now() - 60_000).toISOString(), contactIndex: 0 } })
    render(<SosScreen onClose={() => undefined} />)
    await screen.findByText('SOS saved for the family')
    expect(h.call).not.toHaveBeenCalled()
    expect(await rows('sos_events')).toEqual([])
    expect(hrefs).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Text Ana|Open text again/ }))
    expect(hrefs).toHaveLength(1)
    expect(await rows('sos_events_update')).toEqual([{ id: 'e-old', smsOpened: true }])
  })

  it('a stale kv entry (older than 12 hours) is not resumed: a screen mounted directly starts a new SOS', async () => {
    await db.kv.put({ key: SOS_ACTIVE_KEY, value: { id: 'e-stale', step: 'status', at: new Date(Date.now() - 13 * 3_600_000).toISOString(), contactIndex: 0 } })
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalled())
    expect((await rows('sos_events'))[0]!.id).not.toBe('e-stale')
  })

  it('forces a sync right after the SOS row is queued, so a sync backoff cannot hold it back', async () => {
    startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.sync).toHaveBeenCalledWith(true))
    await waitFor(() => expect(h.call).toHaveBeenCalled()) // let the whole flow finish before the next test clears storage
    await screen.findByText('SOS saved for the family')
  })

  it('the person id that arrives late (cache or network) is waited for, so the SOS is still saved', async () => {
    h.pid = null; h.cached = 'p9'
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalled())
    expect((await rows('sos_events'))[0]).toMatchObject({ personId: 'p9' })
  })

  it('no person id at all: nothing is queued and the screen says so, but the call and the text still happen and nothing is resumed', async () => {
    h.pid = null; h.cached = null
    h.call.mockImplementation(async () => ({ placed: false, via: 'none' }))
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(hrefs).toHaveLength(1), { timeout: 5000 })
    expect(await rows('sos_events')).toEqual([])
    expect(screen.getByText('Could not save for the family')).toBeTruthy()
    expect(await db.kv.get(SOS_ACTIVE_KEY)).toBeUndefined() // an unsaved SOS is not resumed as if it were saved
    expect(await rows('sos_events_update')).toEqual([]) // no row to patch
  })

  it('cancel PATCHes cancelledAt, clears sos.active, and a cancelled SOS never opens the composer by itself', async () => {
    h.call.mockImplementation(() => new Promise(() => undefined)) // the call screen is still up
    await db.kv.put({ key: SOS_CONTACTS_KEY, value: two })
    const s = startSos()
    render(<SosScreen onClose={() => undefined} />)
    await waitFor(() => expect(h.call).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Cancel, I don.t need help/ }))
    await screen.findByText('Glad you are safe')
    const [u] = await rows('sos_events_update')
    expect(u).toMatchObject({ id: s.id })
    expect(Date.parse(String(u!.cancelledAt))).toBeGreaterThan(Date.now() - 5000)
    expect(await db.kv.get(SOS_ACTIVE_KEY)).toBeUndefined()
    expect(hrefs).toEqual([])
    expect(screen.getAllByText(/I am safe/).length).toBe(2) // one "tell them" text per contact
  })
})
