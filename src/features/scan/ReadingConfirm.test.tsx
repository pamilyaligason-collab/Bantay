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
  render(<ReadingConfirm draft={draft} failed={failed} personId="p1" onSaved={onSaved} onBack={() => {}} />)
const bp: ReadingDraft = { ...EMPTY_DRAFT, kind: 'bp', systolic: 128, diastolic: 82, pulse: 71, unit: 'mmHg', confidence: 0.9 }

const tapAll = () => screen.queryAllByRole('button', { name: /^Confirm / }).forEach((b) => fireEvent.click(b))

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
  it('a sure read (0.9 or more) needs no tap; a colour line shows under the numbers', () => {
    show(bp)
    expect(screen.queryAllByRole('button', { name: /^Confirm / })).toHaveLength(0)
    expect((screen.getByRole('button', { name: 'Save reading' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('reading-verdict').getAttribute('data-state')).toBe('above') // 128/82 is above the guide
  })
  it('an unsure read (under 0.9 or none) needs a tap on each prefilled number before Save', async () => {
    const onSaved = vi.fn()
    show({ ...bp, confidence: 0.7 }, false, onSaved)
    const save = screen.getByRole('button', { name: 'Save reading' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getAllByRole('button', { name: /^Confirm / })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm top number' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bottom number' }))
    expect(save.disabled).toBe(true) // pulse still waits
    fireEvent.change(screen.getByLabelText('Pulse'), { target: { value: '72' } }) // editing it counts
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(await hdb.readings.count()).toBe(3)
  })
  it('no confidence at all is treated as unsure', () => {
    show({ ...bp, confidence: null })
    expect((screen.getByRole('button', { name: 'Save reading' }) as HTMLButtonElement).disabled).toBe(true)
    tapAll()
    expect((screen.getByRole('button', { name: 'Save reading' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('a single-number device saves in canonical units: thermometer F to a temperature row, once tapped', async () => {
    const onSaved = vi.fn()
    show({ ...EMPTY_DRAFT, kind: 'temp', value: 98.6, unit: 'F', confidence: 0.8 }, false, onSaved)
    tapAll()
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((await hdb.readings.toArray()).map((r) => [r.test, r.value, r.unit])).toEqual([['temperature', 37, 'C']])
  })
  it('a daily-limit reply says to try tomorrow or type the numbers', () => {
    render(<ReadingConfirm draft={EMPTY_DRAFT} failed limited personId="p1" onSaved={() => {}} onBack={() => {}} />)
    expect(screen.getByText(/Try again tomorrow or type the numbers/)).toBeTruthy()
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
