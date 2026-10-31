import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import WarningCard from './WarningCard'

// S16 D-91: the Jack button hides while a quake or storm warning is on screen. WarningCard marks itself data-nofab; JackFab hides on [data-nofab].
// This pins the real marking (the JackFab unit test only appends a hand-made element).
vi.mock('../location/useLocation', () => ({ usePlace: () => ({ weather: { lat: 6.1, lon: 125.2 }, zone: 'dampas', source: 'zone', settled: true }) }))
vi.mock('../safety/rollcall', async (orig) => ({ ...(await orig<typeof import('../safety/rollcall')>()), fetchRollcall: async () => null, ensureStormTasks: async () => true, sendRollcall: vi.fn(async () => 'sent') }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [], selfId: null }) }))
vi.mock('../viewas/viewAs', () => ({ useActingPersonId: () => 'me', useActingCan: () => null }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))

const issued = new Date().toISOString()
const base = { what: 'x', where: 'Off Bohol', when: 'now', doNow: 'Stay safe.', source: 'PAGASA', sourceUrl: null, issuedAt: issued, lat: 6.2, lon: 125.2, bulletin: 'b' }
const quake: Alert = { ...base, id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', source: 'PHIVOLCS' }
const storm: Alert = { ...base, id: 'pagasa-tcws-x', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas: Typhoon Rosal (CHAMPI)' }
const lapsed: Alert = { ...storm, id: 'pagasa-tcws-y', level: '' } // no signal level: not a live storm, so Today draws the plain tcws hazard card
const heat: Alert = { ...base, id: 'h1', kind: 'heat', level: 'Danger', title: 'Heat index warning' }
const gdacs: Alert = { ...base, id: 'g1', kind: 'gdacs', level: 'Green', title: 'Flood context' }

const nofab = (c: HTMLElement) => c.querySelectorAll('[data-nofab]').length

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('WarningCard data-nofab', () => {
  it('marks the storm section (live signal)', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [storm] })
    const { container } = render(<WarningCard />)
    const sec = await screen.findByRole('region', { name: 'Storm mode' })
    expect(sec.hasAttribute('data-nofab')).toBe(true)
    expect(nofab(container)).toBe(1)
  })
  it('marks the quake hazard card', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    const { container } = render(<WarningCard />)
    expect((await screen.findByRole('region', { name: 'Active warning' })).hasAttribute('data-nofab')).toBe(true)
    expect(nofab(container)).toBe(1)
  })
  it('marks the tcws hazard card when there is no live signal', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [lapsed] })
    const { container } = render(<WarningCard />)
    expect((await screen.findByRole('region', { name: 'Active warning' })).hasAttribute('data-nofab')).toBe(true)
    expect(nofab(container)).toBe(1)
  })
  it('does not mark a heat warning card', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [heat] })
    const { container } = render(<WarningCard />)
    expect((await screen.findByRole('region', { name: 'Active warning' })).hasAttribute('data-nofab')).toBe(false)
    expect(nofab(container)).toBe(0)
  })
  it('does not mark a gdacs alert (context tier, no Today card at all)', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [gdacs] })
    const { container } = render(<WarningCard />)
    await new Promise((r) => setTimeout(r, 60))
    expect(screen.queryByRole('region', { name: 'Active warning' })).toBeNull()
    expect(nofab(container)).toBe(0)
  })
})
