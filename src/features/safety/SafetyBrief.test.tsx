import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resolvePlace } from '../location/place'
import { ALERTS_KEY, type Alert } from './alerts'
import SafetyBrief from './SafetyBrief'

const abroad = resolvePlace({ gps: { lat: 35.68, lon: 139.69 }, lastZone: 'dampas' }) // Tokyo, saved zone Dampas
vi.mock('../location/useLocation', () => ({ usePlace: () => abroad }))
afterEach(cleanup)

const quake = (id: string, where: string, lat: number, lon: number): Alert => ({
  id, kind: 'quake', level: 'Magnitude 5.1', title: `Quake ${where}`, what: 'Magnitude 5.1.', where, when: 'Just now', doNow: 'Drop, cover and hold on.',
  source: 'PHIVOLCS', sourceUrl: 'https://www.phivolcs.dost.gov.ph/', issuedAt: '2026-10-17T01:00:00Z', lat, lon, bulletin: 'b', previousBulletin: null
})

describe('SafetyBrief abroad', () => {
  it('ranks from the saved zone, not the foreign GPS point', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake('jp', 'Tokyo', 35.7, 139.7), quake('ph', 'Dampas', 9.7, 123.9)] })
    render(<SafetyBrief />)
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.getAllByRole('article').map((e) => e.getAttribute('aria-label'))).toEqual(['Quake Dampas', 'Quake Tokyo'])
  })
})
