import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { hdb } from '../records/store'

// D-91: the busy row wears the thinking Jack, but never while an emergency card is on the screen.
const m = vi.hoisted(() => ({ ask: vi.fn() }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../log/store', () => ({ logReading: vi.fn(), logMedTaken: vi.fn(), logActivity: vi.fn() }))
vi.mock('./client', () => ({ ask: m.ask }))
vi.mock('../sos/call', () => ({ callFirstContact: vi.fn() }))
vi.mock('../sos/SosScreen', () => ({ default: () => <div role="dialog" aria-label="SOS screen" /> }))
import Assistant, { ASK_EVENT } from './Assistant'

const type = async (t: string) => {
  fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: t } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}
const thinkingJack = () => document.querySelectorAll('.as-list img.jack')

beforeEach(async () => {
  vi.clearAllMocks()
  await db.kv.clear(); await hdb.people.clear()
  render(<Assistant />)
  act(() => { window.dispatchEvent(new Event(ASK_EVENT)) })
})
afterEach(cleanup)

describe('Assistant thinking Jack (D-91)', () => {
  it('a pending question shows one decorative thinking Jack beside "Thinking..."', async () => {
    m.ask.mockReturnValue(new Promise(() => undefined))
    await type('what is hba1c')
    const row = await screen.findByText('Thinking...')
    expect(thinkingJack()).toHaveLength(1)
    const img = thinkingJack()[0] as HTMLImageElement
    expect(img.getAttribute('alt')).toBe('')
    expect(img.src).toContain('jack-thinking')
    expect(row.getAttribute('role')).toBe('status')
  })

  it('with an emergency card in the transcript the busy row has words only, no Jack', async () => {
    await type('he is unconscious') // local gate: the 911 card
    await screen.findByRole('alert')
    m.ask.mockReturnValue(new Promise(() => undefined))
    await type('what is hba1c')
    await screen.findByText('Thinking...')
    expect(thinkingJack()).toHaveLength(0)
  })
})
