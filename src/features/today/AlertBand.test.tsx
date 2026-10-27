import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import AlertBand from './AlertBand'

vi.mock('../location/useLocation', () => ({ usePlace: () => ({ weather: { lat: 6.2015121, lon: 125.1878084 }, zone: 'conel', source: 'zone' }) }))

const NOW = Date.parse('2026-10-27T06:00:00Z')
const minAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
// 0.8 degrees of latitude north of Conel = 88.95 km (hand-computed), so "89 km".
const quake = (over: Partial<Alert> = {}): Alert => ({
  id: 'q89', kind: 'quake', level: 'Magnitude 4.6', title: 'Magnitude 4.6 earthquake', what: '', where: 'Pondaguitan', when: 'Just now', doNow: 'Drop, cover and hold on.',
  source: 'USGS', sourceUrl: null, issuedAt: minAgo(20), lat: 6.2015121 + 0.8, lon: 125.1878084, bulletin: '', checkedAt: minAgo(5), ...over
})

beforeEach(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); await db.kv.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const show = async (rows: Alert[]) => { await db.kv.put({ key: ALERTS_KEY, value: rows }); render(<AlertBand />) }

describe('AlertBand: does it affect us, and how fresh', () => {
  it('an 89 km quake says far from you, no action, and hides the do-now steps', async () => {
    await show([quake()])
    expect(await screen.findByText('Far from you; no action needed')).toBeTruthy()
    expect(screen.getByText(/\(89 km away\)/)).toBeTruthy()
    expect(screen.queryByText('Drop, cover and hold on.')).toBeNull()
    expect(screen.getByText('Checked 5 min ago')).toBeTruthy()
    expect(screen.queryByText(/may be out of date/)).toBeNull()
    expect(screen.getByRole('link', { name: 'See details' })).toBeTruthy()
  })
  it('a quake 30 km away is near, keeps its steps and the What to do link', async () => {
    await show([quake({ lat: 6.2015121 + 0.27 })])
    expect(await screen.findByText('Near you. Follow the steps below.')).toBeTruthy()
    expect(screen.getByText('Drop, cover and hold on.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'What to do' })).toBeTruthy()
  })
  it('over an hour since the last check shows the amber line even when no row is marked stale', async () => {
    await show([quake({ lat: 6.2015121 + 0.27, checkedAt: minAgo(61), stale: false })])
    expect(await screen.findByText('Checked 1 h ago')).toBeTruthy()
    expect(screen.getByText(/They may be out of date\. Check PAGASA or listen to the radio\./)).toBeTruthy()
  })
  it('exactly 60 minutes is still fine', async () => {
    await show([quake({ lat: 6.2015121 + 0.27, checkedAt: minAgo(60) })])
    expect(await screen.findByText('Checked 1 h ago')).toBeTruthy()
    expect(screen.queryByText(/may be out of date/)).toBeNull()
  })
  it('no check time at all reads as never checked with the amber line', async () => {
    await show([quake({ lat: 6.2015121 + 0.27, checkedAt: null })])
    expect(await screen.findByText('Never checked')).toBeTruthy()
    expect(screen.getByText(/not been checked on this phone yet/)).toBeTruthy()
  })
})
