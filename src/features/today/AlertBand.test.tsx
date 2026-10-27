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
  it('an 89 km M4.6 quake is near (M4 to 5 is felt to 100 km) and keeps its steps', async () => {
    await show([quake()])
    expect(await screen.findByText('Near you. Follow the steps below.')).toBeTruthy()
    expect(screen.getByText(/\(89 km away\)/)).toBeTruthy()
    expect(screen.getByText('Drop, cover and hold on.')).toBeTruthy()
    expect(screen.getByText('Checked 5 min ago')).toBeTruthy()
    expect(screen.queryByText(/no action needed/i)).toBeNull()
  })
  it('an 89 km M3.0 quake is beyond its 50 km radius: the band still shows it with the distance and the steps, and never says no action needed', async () => {
    await show([quake({ level: 'Magnitude 3.0', title: 'Magnitude 3.0 earthquake' })])
    expect(await screen.findByText('About 89 km away. You may feel it. If you feel shaking, follow the steps below.')).toBeTruthy()
    expect(screen.getByText('Drop, cover and hold on.')).toBeTruthy()
    expect(screen.queryByText(/no action needed/i)).toBeNull()
    expect(screen.queryByText(/may be out of date/)).toBeNull()
    expect(screen.getByRole('link', { name: 'What to do' })).toBeTruthy()
  })
  it('an M3.6 quake 140 km away (1.2591 deg) far away (M7.2, 2500 km south) shows with the tsunami line', async () => {
    await show([quake({ level: 'Magnitude 7.2', title: 'Magnitude 7.2 earthquake', lat: 6.2015121 - 22.483 })])
    expect(await screen.findByText('About 2500 km away. You may feel it. If you feel shaking, follow the steps below. If you live near the sea, watch for a tsunami warning.')).toBeTruthy()
    expect(screen.getByText('Warning · Pondaguitan · USGS')).toBeTruthy()
  })
  it('an M3.6 quake 140 km away shows on Today with its distance line', async () => {
    await show([quake({ level: 'Magnitude 3.6', title: 'Magnitude 3.6 earthquake', lat: 6.2015121 + 1.2591 })])
    expect(await screen.findByText('About 140 km away. You may feel it. If you feel shaking, follow the steps below.')).toBeTruthy()
    expect(screen.getByText(/\(140 km away\)/)).toBeTruthy()
  })
  it('Today keeps one band: a typhoon 900 km away outranks a quake because PAGASA-tier rows come first', async () => {
    const typhoon = quake({ id: 't900', kind: 'tcws', level: 'Signal No. 1', title: 'Wind Signal No. 1: Typhoon', lat: 6.2015121 - 8.1, doNow: 'Follow your local DRRMO.' })
    await show([quake({ lat: 6.2015121 + 0.27 }), typhoon])
    expect(await screen.findByText('Wind Signal No. 1: Typhoon')).toBeTruthy()
    expect(screen.getByText('About 901 km away. Follow the steps below.')).toBeTruthy()
    expect(screen.queryByText('Magnitude 4.6 earthquake')).toBeNull()
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
