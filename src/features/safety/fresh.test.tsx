import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from './alerts'
import AlertCard, { FreshLine } from './AlertCard'

vi.mock('../location/useLocation', () => ({ usePlace: () => ({ weather: { lat: 6.2015121, lon: 125.1878084 }, zone: 'conel', source: 'zone' }) }))

const NOW = Date.parse('2026-10-27T06:00:00Z')
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const gdacs: Alert = {
  id: 'gdacs-TC-1', kind: 'gdacs', level: 'Orange', title: 'Orange tropical cyclone BAGYO-26', what: 'A Typhoon was active. Population affected by Category 1 (120 km/h) wind speeds or higher is 0.291 million.',
  where: 'BAGYO-26, Philippines', when: 'Today', doNow: 'Follow your local DRRMO.', source: 'GDACS', sourceUrl: null, issuedAt: minAgo(90), lat: null, lon: null, bulletin: '', checkedAt: minAgo(5)
}

beforeEach(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); await db.kv.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('AlertCard freshness and plain words', () => {
  it('shows how long ago it was checked and the plain GDACS sentence, not the raw one', () => {
    render(<AlertCard alert={gdacs} />)
    expect(screen.getByText(/Checked 5 min ago/)).toBeTruthy()
    expect(screen.getByText(/About 291,000 people live where/)).toBeTruthy()
    expect(screen.queryByText(/Population affected/)).toBeNull()
    expect(screen.queryByText(/may be out of date/)).toBeNull()
  })
  it('amber line when the check is over an hour old and the row is not stale', () => {
    render(<AlertCard alert={{ ...gdacs, checkedAt: minAgo(75), stale: false }} />)
    expect(screen.getByRole('status').textContent).toMatch(/^Alerts last checked .*\. They may be out of date\. Check PAGASA or listen to the radio\.$/)
  })
  it('a stale row keeps the source-unreachable note and does not double up', () => {
    render(<AlertCard alert={{ ...gdacs, checkedAt: minAgo(75), stale: true }} />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toMatch(/source unreachable/)
  })
})

describe('FreshLine', () => {
  it('reads the newest check from the saved list', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [{ ...gdacs, checkedAt: minAgo(200) }, { ...gdacs, id: 'b', checkedAt: minAgo(10) }] })
    render(<FreshLine />)
    expect(await screen.findByText('Checked 10 min ago')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('an empty list is unknown: never checked, amber line (not a calm "all clear")', async () => {
    render(<FreshLine />)
    expect(await screen.findByText('Never checked')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/not been checked on this phone yet/)
  })
})
