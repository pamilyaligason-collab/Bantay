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

describe('AlertCard distance line (D-88)', () => {
  const quake = (over: Partial<Alert>): Alert => ({ ...gdacs, id: 'q', kind: 'quake', level: 'Magnitude 3.6', title: 'Magnitude 3.6 earthquake', what: '', where: 'Far away', doNow: 'If you feel shaking: drop, cover and hold on.', source: 'USGS', lat: 6.2015121 + 1.2591, lon: 125.1878084, ...over })
  it('a far M3.6 quake still has its distance line and steps, never "no action needed"', () => {
    render(<AlertCard alert={quake({})} />)
    expect(screen.getByText(/About 140 km away\. You may feel it\. If you feel shaking, follow the steps below\. \(140 km\)/)).toBeTruthy()
    expect(screen.getByText('If you feel shaking: drop, cover and hold on.')).toBeTruthy()
    expect(screen.queryByText(/no action needed/i)).toBeNull()
  })
  it('M7.2 at 2500 km adds the tsunami line', () => {
    render(<AlertCard alert={quake({ level: 'Magnitude 7.2', title: 'Magnitude 7.2 earthquake', lat: 6.2015121 - 22.483 })} />)
    expect(screen.getByText(/About 2500 km away\..*If you live near the sea, watch for a tsunami warning\. \(2500 km\)/)).toBeTruthy()
  })
  it('a typhoon 900 km away says About 901 km; air 60 km away says far', () => {
    const { unmount } = render(<AlertCard alert={quake({ id: 't', kind: 'tcws', title: 'Typhoon 900', level: 'Signal No. 1', lat: 6.2015121 - 8.1 })} />)
    expect(screen.getByText(/About 901 km away\. Follow the steps below\. \(901 km\)/)).toBeTruthy()
    unmount()
    render(<AlertCard alert={quake({ id: 'a', kind: 'air', title: 'Air 60', level: 'US AQI 120', lat: 6.2015121 + 0.54 })} />)
    expect(screen.getByText(/Far from you\. Watch for updates\. \(60 km\)/)).toBeTruthy()
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
