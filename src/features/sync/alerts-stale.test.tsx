import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import StormTracker from '../safety/StormTracker'
import Warnings from '../safety/Warnings'
import { feedStale, type StaleSources } from '../safety/alerts'
import { sourceRows } from '../safety/warningsLogic'
import { ldb } from '../log/store'
import { hdb } from '../records/store'
import { resetSyncForTests, startSync, syncNow } from './sync'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../safety/StormCard', () => ({ StormBlock: () => <p>roll call</p>, StormCard: () => null }))
vi.mock('../safety/SafetyBrief', () => ({ default: () => <p>brief</p> }))
vi.mock('../safety/NewsTop5', () => ({ default: () => <p>news</p> }))
vi.mock('../safety/PhoneWarnings', () => ({ default: () => <p>phone</p> }))

// R4: the normal day. 0 unexpired rows, the air row keeps the stamp fresh, and a failed source's stale flag sits only on rows the alert list never pulls.
const cfg = { url: 'https://x.supabase.test', key: 'pk', getToken: async () => 'tok1' }
const MIN = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const place = { weather: { lat: 9.65, lon: 123.88 }, zone: 'dampas', source: 'zone' } as never
type Stamp = { source: string; fetched_at: string; stale: boolean }

/** What the server holds, newest first as the read asks. The alert list itself is empty: every row has expired. */
function serve(rows: Stamp[]) {
  vi.stubGlobal('fetch', async (url: string) => {
    const body = decodeURIComponent(url).includes('select=source,fetched_at,stale') ? rows : []
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
}
const air = (m = 4): Stamp => ({ source: 'Open-Meteo', fetched_at: MIN(m), stale: false })
const healthy = (m = 4): Stamp[] => [air(m), { source: 'USGS', fetched_at: MIN(m), stale: false }, { source: 'GDACS', fetched_at: MIN(m), stale: false }, { source: 'PAGASA', fetched_at: MIN(m), stale: false }]
const read = async () => ({
  checked: ((await db.kv.get('alerts:checkedAt'))?.value ?? null) as string | null,
  down: ((await db.kv.get('alerts:staleSources'))?.value ?? {}) as StaleSources
})
const rowsNow = async () => {
  const { checked, down } = await read()
  return Object.fromEntries(sourceRows([], Date.now(), false, checked, down).map((r) => [r.title, r]))
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([db.outbox.clear(), db.kv.clear(), hdb.readings.clear(), hdb.consults.clear(), ldb.meds.clear(), ldb.activity.clear()])
  resetSyncForTests()
  startSync(cfg)()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('a failed source on a quiet day', () => {
  it('GDACS stale for 3 h, air fresh: GDACS is not Live and says its own last good time; healthy feeds stay Live; Storm tracker makes no "no storm" claim; then it recovers', async () => {
    serve([air(), { source: 'USGS', fetched_at: MIN(4), stale: false }, { source: 'PAGASA', fetched_at: MIN(4), stale: false }, { source: 'GDACS', fetched_at: MIN(180), stale: true }, { source: 'GDACS', fetched_at: MIN(190), stale: true }])
    await syncNow()
    let r = await rowsNow()
    expect(r.GDACS).toMatchObject({ live: false, sub: 'Checked 3 h ago', never: false })
    expect(r.USGS).toMatchObject({ live: true, sub: 'Checked 4 min ago' })
    expect(r.PAGASA).toMatchObject({ live: true, sub: 'Checked 4 min ago' })
    const { checked, down } = await read()
    expect(checked).not.toBeNull()
    expect(Date.now() - Date.parse(checked!)).toBeLessThan(5 * 60_000) // the air row keeps the stamp fresh: only the stale list can tell
    expect(feedStale([], checked, down)).toBe(true)

    const first = render(<StormTracker place={place} />)
    await waitFor(() => expect(first.container.textContent).toContain('checked 3 h ago')) // kv loaded; the footer names GDACS, so it never prints the air row's time
    expect(screen.getByRole('status').textContent).toContain('Storms not checked lately')
    expect(screen.getByRole('status').textContent).not.toMatch(/No storm/)
    expect(first.container.querySelector('.st-dot')?.getAttribute('data-on')).toBe('watch')
    first.unmount()

    const warn = render(<Warnings place={place} />)
    await waitFor(() => expect(screen.getByTestId('wn-sources').textContent).toMatch(/GDACS\s*Checked 3 h ago\s*Stale/))
    expect(screen.getByTestId('wn-sources').textContent).toMatch(/USGS\s*Checked 4 min ago\s*Live/)
    await waitFor(() => expect(screen.getByTestId('warn-hero').textContent).toContain('No warnings on this phone'))
    expect(screen.getByTestId('warn-hero').textContent).not.toContain('No active warnings')
    warn.unmount()

    serve(healthy(1)) // setStale(source, false) cleared every row of the source on its next good run
    await syncNow()
    r = await rowsNow()
    expect(r.GDACS).toMatchObject({ live: true, sub: 'Checked 1 min ago' })
    render(<StormTracker place={place} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No storm near the Philippines now'))
  })

  it('all feeds fail, only air succeeds: all three are not Live', async () => {
    serve([air(), { source: 'USGS', fetched_at: MIN(90), stale: true }, { source: 'GDACS', fetched_at: MIN(90), stale: true }, { source: 'PAGASA', fetched_at: MIN(90), stale: true }])
    await syncNow()
    const r = await rowsNow()
    for (const t of ['USGS', 'GDACS', 'PAGASA']) expect(r[t]).toMatchObject({ live: false, sub: 'Checked 1 h ago' })
  })

  it('the healthy live shape (16 rows, 0 stale, newest minutes old): no false alarm', async () => {
    serve(Array.from({ length: 4 }, () => healthy()).flat())
    await syncNow()
    const { checked, down } = await read()
    expect(down).toEqual({})
    expect(feedStale([], checked, down)).toBe(false)
    const r = await rowsNow()
    for (const t of ['USGS', 'GDACS', 'PAGASA']) expect(r[t]).toMatchObject({ live: true, sub: 'Checked 4 min ago' })
    render(<StormTracker place={place} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No storm near the Philippines now'))
  })

  it('a failed stamp read keeps the last list: a down source does not read as recovered', async () => {
    await db.kv.put({ key: 'alerts:staleSources', value: { GDACS: MIN(180) } })
    vi.stubGlobal('fetch', async (url: string) => new Response(decodeURIComponent(url).includes('select=source,fetched_at,stale') ? '{"code":"X"}' : '[]', { status: decodeURIComponent(url).includes('select=source,fetched_at,stale') ? 500 : 200, headers: { 'Content-Type': 'application/json' } }))
    await syncNow()
    expect(Object.keys((await read()).down)).toEqual(['GDACS'])
  })
})
