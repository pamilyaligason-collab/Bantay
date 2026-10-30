import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import WarningCard from './WarningCard'
import { ACK_KEY, ackStamp } from './warnAck'

vi.mock('../location/useLocation', () => ({ usePlace: () => ({ weather: { lat: 6.1, lon: 125.2 }, zone: 'dampas', source: 'zone', settled: true }) }))
vi.mock('../safety/rollcall', async (orig) => ({ ...(await orig<typeof import('../safety/rollcall')>()), fetchRollcall: async () => null, ensureStormTasks: async () => true, sendRollcall: vi.fn(async () => 'sent') }))
vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [], selfId: null }) }))

const issued = new Date().toISOString()
const quake: Alert = { id: 'q1', kind: 'quake', level: 'Magnitude 5.1', title: 'Earthquake', what: 'Magnitude 5.1, 40 km north.', where: 'Off Bohol', when: 'Just now', doNow: 'Drop, cover and hold on.', source: 'PHIVOLCS', sourceUrl: null, issuedAt: issued, lat: 6.2, lon: 125.2, bulletin: 'b' }
const storm: Alert = { id: 'pagasa-tcws-x-dampas', kind: 'tcws', level: 'Signal No. 2', title: 'Wind Signal No. 2 for Dampas: Typhoon Rosal (CHAMPI)', what: 'Strong winds until 6 AM.', where: 'Sarangani (near Dampas)', when: 'now', doNow: 'x', source: 'PAGASA', sourceUrl: 'https://www.pagasa.dost.gov.ph/', issuedAt: issued, lat: 6.1, lon: 125.2, bulletin: 'b' }

beforeEach(async () => { await db.kv.clear() })
afterEach(cleanup)

describe('WarningCard', () => {
  it('draws nothing without a warning', async () => {
    const { container } = render(<WarningCard />)
    await new Promise((r) => setTimeout(r, 40))
    expect(container.textContent).toBe('')
  })

  it('shows the title once with a What to do link; close hides it on Today only, writes warn.ack and toasts', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [quake] })
    const notify = vi.fn()
    render(<WarningCard notify={notify} />)
    const band = await screen.findByRole('region', { name: 'Active warning' })
    expect(screen.getAllByText('Earthquake')).toHaveLength(1)
    expect(band.textContent).toContain('Drop, cover and hold on.')
    expect(screen.getByRole('link', { name: 'What to do' }).getAttribute('href')).toBe('#safety/warnings')
    fireEvent.click(screen.getByRole('button', { name: /Hide this warning/ }))
    expect(notify).toHaveBeenCalledWith('Hidden here. Still in Safety.')
    await waitFor(async () => expect((await db.kv.get(ACK_KEY))?.value).toEqual({ q1: ackStamp(quake) }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Active warning' })).toBeNull())
    expect((await db.kv.get(ALERTS_KEY))?.value).toEqual([quake]) // still in Safety
  })

  it('a higher level shows a closed warning again', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [{ ...quake, level: 'Magnitude 6.0' }] })
    await db.kv.put({ key: ACK_KEY, value: { q1: ackStamp(quake) } })
    render(<WarningCard />)
    expect(await screen.findByRole('region', { name: 'Active warning' })).toBeTruthy()
  })

  it('a storm signal gets the storm variant with the roll-call pair, four Do now rows and the links; the quake is not repeated', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [storm] })
    render(<WarningCard />)
    expect(await screen.findByRole('region', { name: 'Storm mode' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: "I'm OK" })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I need help' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Do now' }).querySelectorAll('li')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'All warnings' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Track the storm/ }).getAttribute('href')).toBe('#safety/storms')
    expect(screen.getByRole('link', { name: /Go-bag: 0 of/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toContain('pagasa')
    expect(screen.queryByRole('region', { name: 'Active warning' })).toBeNull() // same signal is not drawn twice
  })

  it('closing a storm card keeps the roll-call row while a signal is live', async () => {
    await db.kv.put({ key: ALERTS_KEY, value: [storm] })
    await db.kv.put({ key: ACK_KEY, value: { [storm.id]: ackStamp(storm) } })
    render(<WarningCard />)
    expect(await screen.findByRole('region', { name: 'Storm check-in' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: "I'm OK" })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Storm mode' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Do now' })).toBeNull()
  })
})
