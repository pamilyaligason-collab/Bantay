import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hdb } from '../records/store'
import ReadingConfirm from './ReadingConfirm'
import { EMPTY_DRAFT, type ReadingDraft } from './reading'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
beforeEach(async () => { await hdb.readings.clear() })
afterEach(cleanup)

const show = (draft: ReadingDraft, failed = false, onSaved = vi.fn()) =>
  render(<ReadingConfirm draft={draft} failed={failed} personId="p1" forName="Lola" onSaved={onSaved} onBack={() => {}} />)
const bp: ReadingDraft = { ...EMPTY_DRAFT, kind: 'bp', systolic: 128, diastolic: 82, pulse: 71, unit: 'mmHg', confidence: 0.9 }

describe('ReadingConfirm', () => {
  it('shows what was read, big, and saves nothing until Save', async () => {
    show(bp)
    expect((screen.getByLabelText('Top') as HTMLInputElement).value).toBe('128')
    expect((screen.getByLabelText('Bottom') as HTMLInputElement).value).toBe('82')
    expect((screen.getByLabelText('Pulse') as HTMLInputElement).value).toBe('71')
    expect(screen.getByText(/match the device/)).toBeTruthy()
    expect(await hdb.readings.count()).toBe(0)
  })
  it('an edited number is what gets saved', async () => {
    const onSaved = vi.fn()
    show(bp, false, onSaved)
    fireEvent.change(screen.getByLabelText('Top'), { target: { value: '134' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((await hdb.readings.toArray()).map((r) => [r.personId, r.test, r.value, r.unit])).toEqual([['p1', 'bp_systolic', 134, 'mmHg'], ['p1', 'bp_diastolic', 82, 'mmHg'], ['p1', 'heart_rate', 71, 'bpm']])
  })
  it('unread numbers are empty, not 0, and Save refuses until they are typed', async () => {
    const onSaved = vi.fn()
    show({ ...EMPTY_DRAFT, kind: 'bp' }, false, onSaved)
    expect((screen.getByLabelText('Top') as HTMLInputElement).value).toBe('')
    expect(screen.getByText(/not clear/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/top and the bottom/)
    expect(onSaved).not.toHaveBeenCalled()
    expect(await hdb.readings.count()).toBe(0)
  })
  it('a failed read says so and lets the person type', () => {
    show(EMPTY_DRAFT, true)
    expect(screen.getByText(/Could not read the photo/)).toBeTruthy()
  })
  it('glucose in mmol/L is saved as mg/dL', async () => {
    const onSaved = vi.fn()
    show({ ...EMPTY_DRAFT, kind: 'glucose', value: 5.6, unit: 'mmol/L', confidence: 0.9 }, false, onSaved)
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((await hdb.readings.toArray()).map((r) => [r.test, r.value, r.unit])).toEqual([['glucose', 100.9, 'mg/dL']])
  })
  it('changing the device kind switches the fields', () => {
    show(bp)
    fireEvent.click(screen.getByRole('button', { name: 'Weight' }))
    expect(screen.queryByLabelText('Top')).toBeNull()
    expect((screen.getByLabelText('Weight') as HTMLInputElement).value).toBe('')
  })
})
