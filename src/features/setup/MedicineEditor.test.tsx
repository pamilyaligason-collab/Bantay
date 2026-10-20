import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../auth/client', () => ({ supabase: null }))
vi.stubGlobal('matchMedia', undefined)

import { ldb, type Medication } from '../log/store'
import { MEDS_CURSOR, useMedicationRows } from '../health/useMedicationRows'
import { plannedReminders } from '../health/reminders'
import MedicineEditor from './MedicineEditor'

const row = (over: Partial<Medication> = {}): Medication => ({ clientId: 'c1', serverId: 's1', personId: 'p1', name: 'Losartan', medStatus: 'active', status: 'confirmed', schedule: { v: 1, times: ['08:00'] }, ...over })

beforeEach(async () => { await Promise.all([db.outbox.clear(), db.kv.clear(), ldb.medications.clear()]) })
afterEach(cleanup)

describe('MedicineEditor', () => {
  it('adds a medicine with a Morning time chip', async () => {
    render(<MedicineEditor personId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Metformin' }))
    await waitFor(async () => expect(await ldb.medications.count()).toBe(1))
    expect(await screen.findByRole('button', { name: 'Morning 8:00 AM' })).toBeTruthy()
  })

  it('never makes a second row for the same drug: a stopped one is offered Start again', async () => {
    await ldb.medications.add(row({ medStatus: 'stopped', stoppedOn: '2025-01-02' }))
    render(<MedicineEditor personId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Losartan' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Losartan is already on the list (stopped)')
    expect(await ldb.medications.count()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }))
    await waitFor(async () => expect((await ldb.medications.toArray())[0]!.medStatus).toBe('active'))
    expect(await ldb.medications.count()).toBe(1)
  })

  it('taking a chip off deletes with a 6 s Undo toast, and Undo brings it back', async () => {
    await ldb.medications.add(row({ origin: undefined }))
    render(<MedicineEditor personId="p1" />)
    await screen.findByRole('group', { name: 'When you take Losartan' })
    fireEvent.click(screen.getByRole('button', { name: 'Losartan' }))
    const toast = await screen.findByRole('status')
    expect(toast.textContent).toContain('Losartan deleted.')
    expect(await ldb.medications.count()).toBe(0)
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await ldb.medications.count()).toBe(1))
    expect((await db.outbox.toArray()).at(-1)!.payload).toMatchObject({ client_id: 'c1', deletedAt: null })
  })

  it('a medicine from a prescription opens its sheet instead of deleting', async () => {
    await ldb.medications.add(row({ origin: 'rx' }))
    render(<MedicineEditor personId="p1" />)
    await screen.findByRole('group', { name: 'When you take Losartan' })
    fireEvent.click(screen.getByRole('button', { name: 'Losartan' }))
    expect(await screen.findByRole('dialog', { name: 'Edit medicine' })).toBeTruthy()
    expect(await ldb.medications.count()).toBe(1)
  })
})

describe('empty first read is not an answer until the pull has finished', () => {
  it('trusted readers get undefined for [] without a pull cursor, and [] once there is one', async () => {
    const { result } = renderHook(() => useMedicationRows('p1', true))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(result.current).toBeUndefined()
    await act(async () => { await db.kv.put({ key: MEDS_CURSOR, value: '2026-10-20T00:00:00Z' }) })
    await waitFor(() => expect(result.current).toEqual([]))
    const plain = renderHook(() => useMedicationRows('p1'))
    await waitFor(() => expect(plain.result.current).toEqual([]))
  })

  it('reminders keep the legacy profile list until the first pull, then follow the rows', async () => {
    const at = new Date('2026-10-20T06:00:00')
    expect((await plannedReminders(['Losartan 8:00'], 'p1', at)).map((p) => p.at)).toEqual([480])
    await db.kv.put({ key: MEDS_CURSOR, value: '2026-10-20T00:00:00Z' })
    expect(await plannedReminders(['Losartan 8:00'], 'p1', at)).toEqual([])
  })
})
