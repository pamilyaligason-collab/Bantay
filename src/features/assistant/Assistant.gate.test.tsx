import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'

const m = vi.hoisted(() => ({ ask: vi.fn(), call: vi.fn(async () => ({ placed: false, via: 'tel' as const })) }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../log/store', () => ({ logReading: vi.fn(), logMedTaken: vi.fn(), logActivity: vi.fn() }))
vi.mock('./client', () => ({ ask: m.ask }))
vi.mock('../sos/call', () => ({ callFirstContact: m.call }))
vi.mock('../sos/SosScreen', () => ({ default: () => <div role="dialog" aria-label="SOS screen" /> }))
import Assistant, { ASK_EVENT } from './Assistant'

const type = async (t: string) => {
  fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: t } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}
const online = (v: boolean) => { vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v); act(() => { window.dispatchEvent(new Event(v ? 'online' : 'offline')) }) }
const used = async () => ((await db.kv.get('assistant.cap'))?.value as { count: number } | undefined)?.count ?? 0

beforeEach(async () => {
  vi.clearAllMocks()
  await db.kv.clear()
  await hdb.people.clear()
  m.ask.mockResolvedValue({ text: 'Hello', cards: [] })
  render(<Assistant />)
  act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Jack local emergency gate', () => {
  it('shows the 911 card, never calls the server, counts no message, saves nothing', async () => {
    await type('masakit dibdib ko tapos hirap huminga')
    expect((await screen.findByRole('alert')).textContent).toContain('Chest pain needs help now')
    expect(m.ask).not.toHaveBeenCalled()
    expect(await used()).toBe(0)
    expect((await db.kv.get('assistant.history'))?.value ?? []).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Call 911' }))
    expect(m.call).toHaveBeenCalledWith([], { emergency: true })
  })
  it('still answers with the card at the daily limit (the gate runs before the cap)', async () => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
    await db.kv.put({ key: 'assistant.cap', value: { day, count: 30 } })
    await type('I want to die')
    expect(await screen.findByText('Call 1553 (crisis line, free)')).toBeTruthy()
    expect(screen.queryByText(/used all of today/)).toBeNull()
  })
  it('"Tell my family (SOS)" opens the SOS flow', async () => {
    await type('he is unconscious')
    fireEvent.click(await screen.findByRole('button', { name: 'Tell my family (SOS)' }))
    expect(await screen.findByRole('dialog', { name: 'SOS screen' })).toBeTruthy()
  })
  it('a server emergency reply is the same card, and that exchange is not sent back to the model', async () => {
    m.ask.mockResolvedValueOnce({ text: 'Call 911 now.', cards: [], emergency: { kind: 'bp', call: ['911'], text: 'Call 911 now.' } })
    await type('my mother feels odd')
    await screen.findByText('This blood pressure needs help now')
    await waitFor(() => expect((screen.getByLabelText('Your question') as HTMLInputElement).value).toBe(''))
    await type('what is hba1c')
    await waitFor(() => expect(m.ask).toHaveBeenCalledTimes(2))
    expect(m.ask.mock.calls[1]![0]).toEqual([{ role: 'user', content: 'what is hba1c' }])
  })
})

describe('Jack offline', () => {
  it('lists what still works, keeps the question, and sends it once when signal returns', async () => {
    online(false)
    await type('what is hba1c')
    expect(await screen.findByText('Jack needs the internet. You are offline.')).toBeTruthy()
    for (const t of ['First aid', 'Medical ID', 'Call 911']) expect(screen.getByRole('button', { name: new RegExp(t) })).toBeTruthy()
    expect(screen.getByText('Waiting for signal')).toBeTruthy()
    expect(screen.getByPlaceholderText('Jack is waiting for signal')).toBeTruthy()
    expect(m.ask).not.toHaveBeenCalled()
    expect(await used()).toBe(0)
    online(true)
    await waitFor(() => expect(m.ask).toHaveBeenCalledTimes(1))
    expect(m.ask.mock.calls[0]![0]).toEqual([{ role: 'user', content: 'what is hba1c' }])
    expect(await used()).toBe(1)
    expect(screen.queryByText('Waiting for signal')).toBeNull()
  })
  it('an emergency typed offline still gets the 911 card', async () => {
    online(false)
    await type('hindi makahinga si nanay')
    expect((await screen.findByRole('alert')).textContent).toContain('Trouble breathing needs help now')
    expect(screen.queryByText('Waiting for signal')).toBeNull()
  })
})
