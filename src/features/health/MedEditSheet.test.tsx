import 'fake-indexeddb/auto'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const ev = vi.hoisted(() => ({ track: vi.fn(async (_kind: string, _name: string) => true) }))
vi.mock('../admin/events', () => ev)

import { ldb, type Medication } from '../log/store'
import MedEditSheet, { type MedNote } from './MedEditSheet'
import { Medicines } from './Medicines'

const base = (over: Partial<Medication> = {}): Medication => ({
  clientId: 'c1', serverId: 's1', personId: 'p1', name: 'Metformin', strength: '500 mg', dose: '1 tablet', medStatus: 'active', status: 'confirmed',
  schedule: { v: 1, times: ['08:00'], review: true, review_since: '2026-10-20', keep: 'me' }, ...over
})
const outbox = async () => (await db.outbox.toArray()).filter((o) => o.table === 'medications').map((o) => o.payload as Record<string, unknown>)
const events = () => ev.track.mock.calls.map((c) => c[1])

function Host({ med, notes }: { med?: Medication; notes: MedNote[] }) {
  const [open, setOpen] = useState(true)
  return open ? <MedEditSheet med={med} personId="p1" onClose={() => setOpen(false)} onNote={(n) => notes.push(n)} /> : <p>closed</p>
}
async function open(med?: Medication) {
  if (med && med.id == null) await ldb.medications.add(med).then((id) => { med.id = id })
  const notes: MedNote[] = []
  render(<Host med={med} notes={notes} />)
  return { notes, sheet: within(await screen.findByRole('dialog')) }
}

beforeEach(async () => {
  vi.stubGlobal('matchMedia', undefined) // Sheet closes at once without matchMedia
  ev.track.mockClear()
  await Promise.all([db.outbox.clear(), ldb.medications.clear(), ldb.meds.clear()])
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MedEditSheet', () => {
  it('shows the six time chips in 12-hour form, a custom time, and the help line', async () => {
    const { sheet } = await open(base())
    for (const l of ['Morning 8:00 AM', 'Noon 12:00 PM', 'Afternoon 2:00 PM', 'Late afternoon 4:00 PM', 'Evening 8:00 PM', 'Night 9:00 PM', 'Custom']) expect(sheet.getByRole('button', { name: l })).toBeTruthy()
    expect(sheet.getByRole('button', { name: 'Morning 8:00 AM' }).getAttribute('aria-pressed')).toBe('true')
    expect(sheet.getByText('Stop: finished this medicine, it moves to Past. Delete: added by mistake.')).toBeTruthy()
    fireEvent.click(sheet.getByRole('button', { name: 'Custom' }))
    fireEvent.change(sheet.getByLabelText('Custom time'), { target: { value: '09:30' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Add time' }))
    expect(sheet.getByRole('button', { name: '9:30 AM, tap to remove' })).toBeTruthy()
  })

  it('edit to twice a day: saves 24h times, clears the review, keeps unknown keys, upserts on client_id, emits med_edited', async () => {
    const { sheet, notes } = await open(base())
    fireEvent.click(sheet.getByRole('button', { name: 'Evening 8:00 PM' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('closed')).toBeTruthy())
    const row = (await ldb.medications.toArray())[0]!
    expect(row.schedule).toEqual({ v: 1, times: ['08:00', '20:00'], keep: 'me' })
    const [o] = await outbox()
    expect(o).toMatchObject({ client_id: 'c1', serverId: 's1', personId: 'p1', name: 'Metformin', deletedAt: null, medStatus: 'active', status: 'confirmed' })
    expect(o!.id).toBeUndefined()
    expect(events()).toEqual(['med_edited'])
    expect(notes[0]!.text).toBe('Metformin saved.')
  })

  it('As needed removes the times and needs no time to save', async () => {
    const { sheet } = await open(base())
    fireEvent.click(sheet.getByRole('switch', { name: 'As needed' }))
    expect(sheet.getByRole('button', { name: 'Morning 8:00 AM' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await ldb.medications.toArray())[0]!.asNeeded).toBe(true))
    expect(((await ldb.medications.toArray())[0]!.schedule as { times: string[] }).times).toEqual([])
  })

  it('refuses a save with no name, or no time and not as needed', async () => {
    const { sheet } = await open(base())
    fireEvent.click(sheet.getByRole('button', { name: 'Morning 8:00 AM' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
    expect((await sheet.findByRole('alert')).textContent).toMatch(/Pick a time/)
    fireEvent.change(sheet.getByLabelText('Name'), { target: { value: ' ' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
    expect((await sheet.findByRole('alert')).textContent).toMatch(/name/)
    expect(await outbox()).toEqual([])
  })

  it('Pause then Resume change medStatus and emit med_paused', async () => {
    const { sheet, notes } = await open(base())
    fireEvent.click(sheet.getByRole('button', { name: 'Pause' }))
    await waitFor(async () => expect((await ldb.medications.toArray())[0]!.medStatus).toBe('paused'))
    expect(events()).toEqual(['med_paused'])
    expect(notes[0]!.text).toMatch(/paused/)
    cleanup()
    const again = await open((await ldb.medications.toArray())[0])
    expect(again.sheet.getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it('Stop moves it to Past with stopped_on today', async () => {
    const { sheet } = await open(base())
    fireEvent.click(sheet.getByRole('button', { name: 'Stop' }))
    await waitFor(async () => expect((await ldb.medications.toArray())[0]!.medStatus).toBe('stopped'))
    expect((await ldb.medications.toArray())[0]!.stoppedOn).toBe(new Date().toLocaleDateString('en-CA'))
    expect((await outbox())[0]).toMatchObject({ medStatus: 'stopped', stoppedOn: new Date().toLocaleDateString('en-CA') })
  })

  it('a new medicine is confirmed, gets a server id for offline doses, and emits med_added', async () => {
    const { sheet } = await open()
    fireEvent.change(sheet.getByLabelText('Name'), { target: { value: 'Losartan' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Noon 12:00 PM' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await ldb.medications.count()).toBe(1))
    const row = (await ldb.medications.toArray())[0]!
    expect(row).toMatchObject({ name: 'Losartan', status: 'confirmed', medStatus: 'active', personId: 'p1' })
    expect(row.serverId).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.schedule).toEqual({ v: 1, times: ['08:00', '12:00'] })
    expect((await outbox())[0]).toMatchObject({ serverId: row.serverId, client_id: row.clientId })
    expect(events()).toEqual(['med_added'])
  })
})

describe('Delete and Undo on the Medicines screen', () => {
  it('Delete removes the row, sends deleted_at, shows an Undo toast for 6 s; Undo brings it back', async () => {
    await ldb.medications.add(base({ schedule: { v: 1, times: ['08:00'] } }))
    render(<Medicines personId="p1" mine canMark canEdit />)
    fireEvent.click(await screen.findByRole('button', { name: /^Metformin 500 mg/ }))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const toast = await screen.findByRole('status')
    expect(toast.textContent).toContain('Metformin deleted.')
    expect(await ldb.medications.count()).toBe(0)
    expect((await outbox())[0]!.deletedAt).toEqual(expect.stringMatching(/^2/))
    expect(events()).toEqual(['med_deleted'])
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await ldb.medications.count()).toBe(1))
    const all = await outbox()
    expect(all[all.length - 1]).toMatchObject({ client_id: 'c1', deletedAt: null })
    expect((await ldb.medications.toArray())[0]!.clientId).toBe('c1')
    vi.useRealTimers()
  })

  it('the toast goes away after 6 seconds', async () => {
    await ldb.medications.add(base({ schedule: { v: 1, times: ['08:00'] } }))
    render(<Medicines personId="p1" mine canMark canEdit />)
    fireEvent.click(await screen.findByRole('button', { name: /^Metformin 500 mg/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('status')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 8000 })
  }, 12000)

  it('a viewer with no rights sees no Add, Take or edit controls', async () => {
    await ldb.medications.add(base({ schedule: { v: 1, times: ['08:00'], review: true } }))
    render(<Medicines personId="p1" mine={false} canMark={false} canEdit={false} />)
    await screen.findByTestId('meds-today')
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Take / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Yes, still/ })).toBeNull()
  })
})
