import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'

const m = vi.hoisted(() => ({ logReading: vi.fn(async () => 1), logMedTaken: vi.fn(async () => 1), logActivity: vi.fn(async () => 1), ask: vi.fn() }))
vi.mock('../log/store', () => ({ logReading: m.logReading, logMedTaken: m.logMedTaken, logActivity: m.logActivity }))
vi.mock('./client', () => ({ ask: m.ask }))
import Assistant from './Assistant'

const draft = { text: 'Draft ready', cards: [{ kind: 'draft', id: 'c0', tool: 'log_reading', fields: { person: 'Lola', test: 'HbA1c', value: '6.1', unit: '%', takenAt: '' } }] }

async function askOnce() {
  render(<Assistant />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask Bantay' }))
  fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'my sugar was 6.1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByRole('group', { name: /Draft/ })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.kv.clear()
  await hdb.people.clear()
  await hdb.people.add({ id: 'p1', name: 'Lola' })
  m.ask.mockResolvedValue(draft)
})
afterEach(cleanup)

describe('Assistant', () => {
  it('opens a dialog and Esc closes it', async () => {
    render(<Assistant />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Bantay' }))
    const dlg = await screen.findByRole('dialog')
    fireEvent.keyDown(dlg, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('Confirm saves exactly once, even on a double tap', async () => {
    await askOnce()
    const b = screen.getByRole('button', { name: 'Confirm' })
    fireEvent.click(b)
    fireEvent.click(b)
    await screen.findByText(/Saved for Lola/)
    expect(m.logReading).toHaveBeenCalledTimes(1)
  })
  it('Discard saves nothing', async () => {
    await askOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await screen.findByText('Discarded.')
    expect(m.logReading).not.toHaveBeenCalled()
    expect(m.logMedTaken).not.toHaveBeenCalled()
    expect(m.logActivity).not.toHaveBeenCalled()
  })
  it('shows the friendly limit message and does not call the server', async () => {
    await db.kv.put({ key: 'assistant.cap', value: { day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), count: 30 } })
    render(<Assistant />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask Bantay' }))
    fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/used all of today/)
    expect(m.ask).not.toHaveBeenCalled()
  })
})
