import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import NearbyList from './NearbyList'
import { ACK_KEY, ackStamp } from './warnAck'

vi.mock('../location/useLocation', () => ({ usePlace: () => ({ weather: { lat: 6.1, lon: 125.2 }, zone: 'dampas', source: 'zone', settled: true }) }))

const base = { what: 'x', where: 'Conel', when: 'now', doNow: 'Stay safe.', source: 'PAGASA', sourceUrl: null, issuedAt: new Date().toISOString(), lat: 6.2, lon: 125.2, bulletin: 'b' }
const storm: Alert = { ...base, id: 'tc1', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Conel: Typhoon Rosal' }
const air: Alert = { ...base, id: 'air1', kind: 'air', level: 'Poor', title: 'Air is poor' }
const water: Alert = { ...base, id: 'u1', kind: 'utility', level: 'Notice', title: 'Water interruption' }

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('NearbyList', () => {
  it('leaves out a live storm (it has its own card) and a closed notice', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [storm, air, water] })
    await db.kv.put({ key: ACK_KEY, value: { [water.id]: ackStamp(water) } })
    render(<NearbyList />)
    expect(await screen.findByText('Air is poor')).toBeTruthy()
    expect(screen.queryByText(/Wind Signal No. 2/)).toBeNull()
    expect(screen.queryByText('Water interruption')).toBeNull()
  })
})
