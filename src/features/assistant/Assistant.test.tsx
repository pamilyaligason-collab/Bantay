import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'

const m = vi.hoisted(() => ({ logReading: vi.fn(async () => 1), logMedTaken: vi.fn(async () => 1), logActivity: vi.fn(async () => 1), ask: vi.fn(), addTask: vi.fn(async () => undefined) }))
vi.mock('../family/tasks', () => ({ addTask: m.addTask }))
vi.mock('../log/store', () => ({ logReading: m.logReading, logMedTaken: m.logMedTaken, logActivity: m.logActivity }))
vi.mock('./client', () => ({ ask: m.ask }))
import Assistant, { ASK_EVENT } from './Assistant'

const draft = { text: 'Draft ready', cards: [{ kind: 'draft', id: 'c0', tool: 'log_reading', fields: { person: 'Lola', test: 'HbA1c', value: '6.1', unit: '%', takenAt: '' } }] }

async function askOnce() {
  render(<Assistant />)
  act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })
  fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'my sugar was 6.1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByRole('group', { name: /Draft/ })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.kv.clear()
  await hdb.people.clear()
  await hdb.readings.clear()
  await hdb.people.add({ id: 'p1', name: 'Lola' })
  m.ask.mockResolvedValue(draft)
})
afterEach(cleanup)

describe('Assistant', () => {
  it('opens a dialog and Esc closes it', async () => {
    render(<Assistant />)
    act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })
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
  it('unknown person: Pick who, Confirm disabled until chosen', async () => {
    m.ask.mockResolvedValue({ text: 'x', cards: [{ ...draft.cards[0], fields: { ...draft.cards[0]!.fields, person: 'Nobody' } }] })
    await askOnce()
    const b = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement
    expect(b.disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } })
    expect(b.disabled).toBe(false)
    fireEvent.click(b)
    await screen.findByText(/Saved for Lola/)
    expect(m.logReading).toHaveBeenCalledTimes(1)
  })
  it('shows the friendly limit message and does not call the server', async () => {
    await db.kv.put({ key: 'assistant.cap', value: { day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()), count: 30 } })
    render(<Assistant />)
    act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })
    fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/used all of today/)
    expect(m.ask).not.toHaveBeenCalled()
  })
})

describe('Assistant v2', () => {
  const open = async () => {
    render(<Assistant />)
    act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })
    await screen.findByRole('dialog')
  }
  it('has a one-line title, a small Close icon and the four chips', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Ask Bantay' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    for (const c of ['Log my BP', 'Did I take my medicine?', 'What does HbA1c mean?', 'Add a task']) expect(screen.getByRole('button', { name: c })).toBeTruthy()
  })
  it('a complete chip asks right away; an incomplete one only fills the box', async () => {
    m.ask.mockResolvedValue({ text: 'It means a 3 month average.', cards: [] })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }))
    expect((screen.getByLabelText('Your question') as HTMLInputElement).value).toBe('Add a task: ')
    expect(m.ask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'What does HbA1c mean?' }))
    await screen.findByText('It means a 3 month average.')
    expect(m.ask).toHaveBeenCalledTimes(1)
  })
  it('hides the mic when the browser has no speech recognition', async () => {
    await open()
    expect(screen.queryByRole('button', { name: /Speak/ })).toBeNull()
  })
  it('mic fills the box from what was said', async () => {
    let inst: { onresult: (e: unknown) => void; onend: () => void } | undefined
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = class { lang = ''; interimResults = false; onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror = null; start() { inst = this as never } stop() {} }
    try {
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Speak' }))
      act(() => inst!.onresult({ results: [[{ transcript: 'what is my last sugar' }]] }))
      expect((screen.getByLabelText('Your question') as HTMLInputElement).value).toBe('what is my last sugar')
      act(() => inst!.onend())
      expect(screen.getByRole('button', { name: 'Speak' })).toBeTruthy()
    } finally { delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition }
  })
  it('task card calls addTask once on a double tap and saves nothing on Discard', async () => {
    m.ask.mockResolvedValue({ text: 'Draft', cards: [{ kind: 'task', id: 'c0', title: 'Buy rice', due: '2026-10-25', assignee: 'Lola' }] })
    await open()
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'add a task buy rice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const b = await screen.findByRole('button', { name: 'Confirm' })
    fireEvent.click(b)
    fireEvent.click(b)
    await screen.findByText(/Task added: Buy rice/)
    expect(m.addTask).toHaveBeenCalledTimes(1)
    expect(m.addTask).toHaveBeenCalledWith({ title: 'Buy rice', due: '2026-10-25', assigneePersonId: 'p1' })
  })
  it('records card answers locally from saved readings with a citation', async () => {
    await hdb.readings.add({ personId: 'p1', takenAt: '2026-10-02T04:00:00.000Z', test: 'hba1c', value: 6.8, unit: '%', sourceFileId: 'f', confirmedAt: '2026-10-03T00:00:00Z' })
    m.ask.mockResolvedValue({ text: 'Here you go', cards: [{ kind: 'records', id: 'c0', person: 'Lola', test: 'HbA1c' }] })
    await open()
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'my last hba1c' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/last HbA1c was 6.8 %/)
    expect(screen.getByText('From your lab result on 2 Oct 2026')).toBeTruthy()
  })
})
