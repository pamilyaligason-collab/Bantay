import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ sendRecap: vi.fn(), sendKudosHeart: vi.fn(), sendAttachment: vi.fn() }))
vi.mock('../family/messagesApi', async (orig) => ({ ...(await orig<typeof import('../family/messagesApi')>()), ...api }))
vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../admin/events', () => ({ track: vi.fn() }))

import { ldb, type MedTaken, type Medication } from '../log/store'
import type { Reading } from '../health/ranges'
import type { FamilyPerson } from '../family/roster'
import { Kudos } from './Kudos'
import { Pillbox } from './Pillbox'
import { Pixels } from './Pixels'
import { Recap } from './Recap'

afterEach(cleanup)
beforeEach(async () => { vi.clearAllMocks(); api.sendRecap.mockResolvedValue({ ok: true, data: null }); api.sendKudosHeart.mockResolvedValue({ ok: true, data: null }); await Promise.all([ldb.meds.clear(), ldb.medications.clear()]) })

const now = new Date(2026, 2, 15, 20, 0)
const at = (d: number, h: number, m = 30) => new Date(2026, 2, d, h, m).toISOString()
const SYS = [130, 132, 134, 136, 131, 135, 133]
const DIA = [80, 82, 84, 86, 81, 85, 83]
const readings: Reading[] = SYS.flatMap((s, k) => [
  { personId: 'me', takenAt: at(9 + k, 7), test: 'bp_systolic', value: s, unit: 'mmHg' },
  { personId: 'me', takenAt: at(9 + k, 7), test: 'bp_diastolic', value: DIA[k]!, unit: 'mmHg' }
])
const med: Medication = { personId: 'me', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['08:00'] }, startedOn: '2026-03-01', medStatus: 'active' }
const takes: MedTaken[] = [9, 10, 11, 13, 15].map((d) => ({ personId: 'me', name: 'Losartan', medicationId: 'm1', slot: '08:00', takenAt: at(d, 8, 10) }))

describe('Recap card', () => {
  it('shows the hand-computed week and shares COUNTS only', async () => {
    render(<Recap personId="me" readings={readings} meds={[med]} takes={takes} now={now} />)
    expect(screen.getByTestId('recap-avg').textContent).toBe('133/83')
    expect(screen.getByTestId('recap-checks').textContent).toBe('7 of 7')
    expect(screen.getByTestId('recap-meds').textContent).toBe('5 of 7')
    fireEvent.click(screen.getByTestId('recap-share'))
    await waitFor(() => expect(api.sendRecap).toHaveBeenCalledTimes(1))
    const body = api.sendRecap.mock.calls[0]![0] as string
    expect(body).toBe('This week: 7 of 7 morning checks, medicines on 5 of 7 days.')
    expect(body).not.toMatch(/133|83/)
    expect((await screen.findByTestId('recap-said')).textContent).toMatch(/Shared/)
  })
  it('an empty week has nothing to share and no made-up zero', () => {
    render(<Recap personId="me" readings={[]} meds={[]} takes={[]} now={now} />)
    expect(screen.getByTestId('recap-avg').textContent).toBe('No readings yet')
    expect((screen.getByTestId('recap-share') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Pillbox card', () => {
  it('a tap on today\'s open cell logs the dose once, a second tap logs nothing more', async () => {
    const m: Medication = { personId: 'me', name: 'Losartan', serverId: 'm1', schedule: { v: 1, times: ['00:01'] }, startedOn: '2020-01-01', medStatus: 'active' }
    await ldb.medications.add(m)
    render(<Pillbox personId="me" meds={[m]} takes={[]} canMark />)
    const btn = document.querySelector('button[data-cell$=":am"]') as HTMLButtonElement
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    await waitFor(async () => expect(await ldb.meds.count()).toBe(1))
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 50))
    expect(await ldb.meds.count()).toBe(1)
    const row = (await ldb.meds.toArray())[0]!
    expect([row.personId, row.name, row.medicationId, row.slot]).toEqual(['me', 'Losartan', 'm1', '00:01'])
  })
  it('a viewer who may not mark sees the cell but cannot tap it', () => {
    const m: Medication = { personId: 'ma', name: 'Aspirin', serverId: 'm9', schedule: { v: 1, times: ['00:01'] }, startedOn: '2020-01-01', medStatus: 'active' }
    render(<Pillbox personId="ma" meds={[m]} takes={[]} canMark={false} />)
    expect(document.querySelector('button[data-cell]')).toBeNull()
    expect(document.querySelector('[data-state="open"]')).toBeTruthy()
  })
  it('names every cell for a screen reader and keeps past not-logged quiet', () => {
    render(<Pillbox personId="me" meds={[med]} takes={takes} canMark now={now} />)
    const cells = [...document.querySelectorAll('[data-cell]')]
    expect(cells.every((c) => !!c.getAttribute('aria-label'))).toBe(true)
    expect(document.querySelectorAll('[data-state="done"]')).toHaveLength(5)
    expect(document.querySelectorAll('[data-state="missed"]')).toHaveLength(2)
  })
})

describe('Pixels card', () => {
  const rows: Reading[] = [
    { personId: 'me', takenAt: at(5, 7), test: 'bp_systolic', value: 134, unit: 'mmHg' }, { personId: 'me', takenAt: at(5, 7), test: 'bp_diastolic', value: 84, unit: 'mmHg' },
    { personId: 'me', takenAt: at(6, 7), test: 'bp_systolic', value: 118, unit: 'mmHg' }, { personId: 'me', takenAt: at(6, 7), test: 'bp_diastolic', value: 76, unit: 'mmHg' }
  ]
  it('draws a mark for each logged day, one legend row per level with counts, and a text summary', () => {
    render(<Pixels personId="me" readings={rows} now={now} />)
    const svg = screen.getByRole('img', { name: /2026: 2 days with a blood pressure/ })
    expect(svg.querySelectorAll('rect').length).toBe(1) // 134/84 = Above target = square
    expect(svg.querySelectorAll('circle[fill]').length).toBe(1) // 118/76 = In range = circle
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Above target').parentElement!.textContent).toMatch(/1$/)
    expect(within(legend).getAllByRole('listitem')).toHaveLength(5)
  })
  it('steps back a year and never forward past this year', () => {
    render(<Pixels personId="me" readings={rows} now={now} />)
    expect((screen.getByLabelText('Next year') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Previous year'))
    expect(screen.getByTestId('px-year').textContent).toBe('2025')
    expect(screen.getByText(/No blood pressure logged in 2025/)).toBeTruthy()
  })
})

describe('Kudos card', () => {
  const people: FamilyPerson[] = [
    { id: 'me', name: 'Test Me', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true },
    { id: 'lola', name: 'Lola Rosa', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false }
  ]
  it('lists the others, never me, and sends a heart about that person', async () => {
    render(<Kudos people={people} />)
    expect(screen.queryByLabelText(/heart to Test/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Send a heart to Lola'))
    await waitFor(() => expect(api.sendKudosHeart).toHaveBeenCalledWith('lola'))
    expect((await screen.findByTestId('kudos-said')).textContent).toMatch(/^Sent/)
  })
  it('says plainly when it needs signal', async () => {
    api.sendKudosHeart.mockResolvedValue({ ok: false, error: 'offline' })
    render(<Kudos people={people} />)
    fireEvent.click(screen.getByLabelText('Send a heart to Lola'))
    expect((await screen.findByTestId('kudos-said')).textContent).toMatch(/signal/)
  })
})
